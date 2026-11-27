# flock.tt layout model: evaluation

Trained from scratch on 120,000 generated prompts (`make_data.py`), 40 epochs, 2048 hashed features -> 192 hidden -> 6 heads.

Held-out evaluation (3,000 prompts written with phrasings the model never saw in training, e.g. "shoutouts",
"rankings", "chat vote", "cherry", "lilac"):

| Head | Score |
|---|---|
| Overlay choice (F1) | 0.85 |
| Overlay choice (per-overlay accuracy) | 93.6% |
| Every overlay exactly right | 37% |
| Portrait / landscape | 99.7% |
| Black / white theme | 99.7% |
| Accent colour | 75% (most misses are the unseen colour words) |
| Goal type | 99.6% |
| How busy (minimal / normal / full) | 90.6% |

The test set is deliberately hard: 40% of prompts remove something ("no chat", "without the jar and no leaderboard"), with typos and slang.
On familiar phrasings (validation) it scores around 0.93 overlay F1.

The shipped model (`public/ai/layout-model.json`) is retrained with the held-out phrasings included
(`ALL_WORDS=1`), so it knows those words too; the numbers above are from the run that kept them unseen.
