# FlockAi (flock.tt layout model): evaluation

Trained from scratch on 120,000 generated prompts (`make_data.py`), 40 epochs.
Shipped size: 8,192 hashed text features -> 768 hidden units -> 6 heads (about 6.3 million parameters,
8 MB as int8 weights). Train it with `DIM=8192 HIDDEN=768 npm run ai:train`.

## Held-out test

3,000 prompts written with phrasings the model never saw in training ("shoutouts", "rankings", "chat vote",
"cherry", "lilac" ...). The set is deliberately hard: 40% of prompts remove something ("no chat", "without the
jar and no leaderboard"), with typos and slang.

| Model size | Parameters | File | Every overlay exactly right | Overlay F1 |
|---|---|---|---|---|
| 2,048 features, 192 hidden | 0.4 M | 0.5 MB | 36.5% | 0.851 |
| 2,048 features, 768 hidden | 1.6 M | 2 MB | 41.9% | 0.870 |
| 8,192 features, 192 hidden | 1.6 M | 2 MB | 41.0% | 0.874 |
| **8,192 features, 768 hidden (shipped)** | **6.3 M** | **8 MB** | **45.2%** | **0.885** |

The shipped model on the other heads (held-out): portrait / landscape 100%, theme 99.9%, goal type 99.7%,
how busy 91.9%, accent colour 75% (its misses are colour words it had never seen).

The shipped model is then retrained with the held-out phrasings included (`ALL_WORDS=1`) so it knows those
words too; the numbers above are from the runs that kept them unseen.
