# flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
"""Trains the flock.tt layout model from scratch and exports it for the app.

Model: hashed text features (2048) -> 128 hidden (ReLU) -> six heads
  overlays (23 yes/no), orientation, theme, accent colour, goal type, density.

    python3 make_data.py && python3 train.py   -> public/ai/layout-model.json
"""
import base64, json, os, random
import numpy as np
import torch
import torch.nn as nn
from spec import OVERLAYS, ORIENT, THEME, ACCENT, GOAL, DENSITY, DIM, features

HIDDEN = int(os.environ.get('HIDDEN', 192))
EPOCHS = int(os.environ.get('EPOCHS', 40))
HEADS = [('orient', len(ORIENT)), ('theme', len(THEME)), ('accent', len(ACCENT)), ('goal', len(GOAL)), ('density', len(DENSITY))]
torch.manual_seed(0); random.seed(0); np.random.seed(0)


def load(name):
    rows = [json.loads(l) for l in open(f'data/{name}.jsonl')]
    X = np.zeros((len(rows), DIM), dtype=np.float32)
    for i, r in enumerate(rows):
        for k, v in features(r['text']).items():
            X[i, k] = v
    Y = {'overlays': torch.tensor([r['overlays'] for r in rows], dtype=torch.float32)}
    for h, _ in HEADS:
        Y[h] = torch.tensor([r[h] for r in rows])
    return torch.from_numpy(X), Y, rows


class LayoutModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.hidden = nn.Linear(DIM, HIDDEN)
        self.drop = nn.Dropout(0.2)
        self.overlays = nn.Linear(HIDDEN, len(OVERLAYS))
        self.heads = nn.ModuleDict({h: nn.Linear(HIDDEN, n) for h, n in HEADS})

    def forward(self, x):
        z = self.drop(torch.relu(self.hidden(x)))
        return self.overlays(z), {h: m(z) for h, m in self.heads.items()}


def evaluate(model, X, Y):
    model.eval()
    with torch.no_grad():
        ov, hs = model(X)
    pred = (torch.sigmoid(ov) > 0.5).float()
    out = {'overlays_exact': (pred == Y['overlays']).all(1).float().mean().item(),
           'overlay_acc': (pred == Y['overlays']).float().mean().item()}
    tp = (pred * Y['overlays']).sum(); fp = (pred * (1 - Y['overlays'])).sum(); fn = ((1 - pred) * Y['overlays']).sum()
    out['overlay_f1'] = (2 * tp / (2 * tp + fp + fn)).item()
    for h, _ in HEADS:
        out[h] = (hs[h].argmax(1) == Y[h]).float().mean().item()
    model.train()
    return out


def quantize(w):
    """int8 per output row + a float scale, packed as base64."""
    w = w.detach().cpu().numpy().astype(np.float32)
    scale = np.abs(w).max(axis=1, keepdims=True) / 127.0 + 1e-12
    q = np.clip(np.round(w / scale), -127, 127).astype(np.int8)
    return {'rows': w.shape[0], 'cols': w.shape[1], 'q': base64.b64encode(q.tobytes()).decode(), 'scale': [round(float(s), 8) for s in scale[:, 0]]}


def main():
    Xtr, Ytr, _ = load('train'); Xva, Yva, _ = load('val'); Xte, Yte, test_rows = load('test')
    model = LayoutModel()
    opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=EPOCHS * ((len(Xtr) + 255) // 256))
    bce, ce = nn.BCEWithLogitsLoss(), nn.CrossEntropyLoss()
    n, bs = len(Xtr), 256
    best, best_state = -1, None
    for epoch in range(EPOCHS):
        perm = torch.randperm(n)
        total = 0.0
        for i in range(0, n, bs):
            idx = perm[i:i + bs]
            ov, hs = model(Xtr[idx])
            loss = bce(ov, Ytr['overlays'][idx]) + sum(ce(hs[h], Ytr[h][idx]) * 0.5 for h, _ in HEADS)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            total += loss.item() * len(idx)
        m = evaluate(model, Xva, Yva)
        score = m['overlay_f1'] + m['overlays_exact']
        if score > best: best, best_state = score, {k: v.clone() for k, v in model.state_dict().items()}
        if (epoch + 1) % 5 and epoch + 1 != EPOCHS: continue
        print(f"epoch {epoch + 1:2d} loss {total / n:.4f} | val exact {m['overlays_exact']:.3f} f1 {m['overlay_f1']:.3f} "
              f"orient {m['orient']:.3f} theme {m['theme']:.3f} accent {m['accent']:.3f} goal {m['goal']:.3f} density {m['density']:.3f}", flush=True)
    model.load_state_dict(best_state)
    t = evaluate(model, Xte, Yte)
    print('TEST (held-out phrasings):', {k: round(v, 3) for k, v in t.items()})

    if os.environ.get('NO_EXPORT') == '1':
        return
    os.makedirs('../../public/ai', exist_ok=True)
    out = {
        'version': 1, 'dim': DIM, 'hidden': HIDDEN,
        'labels': {'overlays': OVERLAYS, 'orient': ORIENT, 'theme': THEME, 'accent': ACCENT, 'goal': GOAL, 'density': DENSITY},
        'test': {k: round(v, 4) for k, v in t.items()},
        'layers': {'hidden': {**quantize(model.hidden.weight), 'bias': [round(float(b), 6) for b in model.hidden.bias]},
                   'overlays': {**quantize(model.overlays.weight), 'bias': [round(float(b), 6) for b in model.overlays.bias]},
                   **{h: {**quantize(model.heads[h].weight), 'bias': [round(float(b), 6) for b in model.heads[h].bias]} for h, _ in HEADS}},
    }
    path = '../../public/ai/layout-model.json'
    with open(path, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print('exported', path, os.path.getsize(path) // 1024, 'KB')

    # a few reference predictions so the JavaScript port can be checked against Python
    model.eval()
    refs = []
    for text in ['chill pink stream with a poll and a goal', 'landscape gaming layout no chat', 'white minimal subathon setup', 'battle stream with wins and losses in gold']:
        x = torch.zeros(1, DIM)
        for k, v in features(text).items(): x[0, k] = v
        with torch.no_grad():
            ov, hs = model(x)
        refs.append({'text': text, 'overlays': [round(float(p), 4) for p in torch.sigmoid(ov)[0]], **{h: int(hs[h].argmax(1)) for h, _ in HEADS}})
    json.dump(refs, open('data/reference.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
