# flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
"""Shared definitions for the flock.tt layout model: label sets and the text featurizer.
The featurizer is mirrored exactly in public/ai/layout-model.js; change both together."""
import math, re

OVERLAYS = ['alerts', 'chat', 'combos', 'hearts', 'ticker', 'jar', 'wheel', 'battle', 'race', 'topgift', 'emojis',
            'celebrate', 'stats', 'gifters', 'counter', 'timer', 'record', 'poll', 'queue', 'banner', 'recent', 'camframe', 'goal']
ORIENT = ['portrait', 'landscape']
THEME = ['black', 'white']
ACCENT = ['none', 'red', 'pink', 'purple', 'blue', 'cyan', 'green', 'yellow', 'orange', 'gold']
GOAL = ['likes', 'follows', 'coins']
DENSITY = ['minimal', 'normal', 'full']

import os
DIM = int(os.environ.get('DIM', 2048))
NEG = {'no', 'without', 'not', 'dont', 'remove', 'minus', 'except', 'skip', 'hate', 'nothing', 'ditch', 'drop', 'nah', 'never', 'w/o', 'wo'}

def fnv1a(s: str) -> int:
    h = 0x811C9DC5
    for b in s.encode('utf-8'):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h

def tokens(text: str):
    t = text.lower().replace("'", '')
    t = re.sub(r'[^a-z0-9!]+', ' ', t)
    return t.split()

def features(text: str):
    """Hashed bag of words, bigrams, word-boundary character trigrams and 'negated' words -> L2-normalised dict."""
    toks = tokens(text)
    feats = {}
    def add(key):
        i = fnv1a(key) % DIM
        feats[i] = feats.get(i, 0.0) + 1.0
    neg_left = 0
    for i, w in enumerate(toks):
        add('w:' + w)
        if i + 1 < len(toks):
            add('b:' + w + '_' + toks[i + 1])
        p = '#' + w + '#'
        for j in range(len(p) - 2):
            add('c:' + p[j:j + 3])
        if neg_left > 0:
            add('n:' + w)
            neg_left -= 1
        if w in NEG:
            neg_left = 3
    for k in feats:
        feats[k] = math.log1p(feats[k])
    norm = math.sqrt(sum(v * v for v in feats.values())) or 1.0
    return {k: v / norm for k, v in feats.items()}
