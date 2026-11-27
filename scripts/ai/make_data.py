# flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
"""Generates labelled training prompts for the flock.tt layout model.

Every example is a made-up streamer request plus the right answer: which overlays, portrait or landscape,
black or white theme, accent colour, goal type and how busy the layout is. Wording is varied with
synonyms, slang, filler and typos. A held-out set of phrasings (HOLDOUT) never appears in training,
so the test score shows how well the model copes with words it hasn't seen in that exact form.

    python3 make_data.py            -> data/train.jsonl, data/val.jsonl, data/test.jsonl
"""
import json, os, random
from spec import OVERLAYS, ORIENT, THEME, ACCENT, GOAL, DENSITY

# What each kind of stream usually wants (the model learns these defaults).
STREAM_TYPES = {
    'gaming': (['gaming', 'gamer', 'game', 'games', 'fortnite', 'minecraft', 'roblox', 'cod', 'valorant', 'fifa', 'gta', 'apex', 'warzone', 'speedrun'],
               ['alerts', 'stats', 'chat', 'goal', 'recent']),
    'chat': (['just chatting', 'chatting', 'chill', 'chilling', 'talk', 'talking', 'hangout', 'hanging out', 'cozy', 'vibe', 'vibes', 'irl', 'get ready with me', 'grwm', 'late night'],
             ['alerts', 'chat', 'goal', 'hearts', 'banner']),
    'subathon': (['subathon', 'marathon', '24 hour', '24h', 'all night', 'endurance', 'timer stream'],
                 ['timer', 'goal', 'gifters', 'alerts', 'jar']),
    'battle': (['battle', 'battles', 'pk', 'match', 'matches', 'versus', 'vs', 'tournament', '1v1', 'ranked'],
               ['battle', 'record', 'alerts', 'topgift', 'celebrate']),
    'gifts': (['gift', 'gifting', 'gift stream', 'donation', 'donations', 'money', 'support stream', 'rose stream', 'tap tap'],
              ['jar', 'topgift', 'combos', 'alerts', 'celebrate']),
    'music': (['music', 'singing', 'karaoke', 'dj', 'piano', 'guitar', 'song requests', 'concert', 'rap'],
              ['hearts', 'chat', 'alerts', 'gifters', 'banner']),
    'qa': (['q&a', 'qna', 'questions', 'ask me anything', 'ama', 'advice', 'storytime', 'debate'],
           ['chat', 'poll', 'alerts', 'banner']),
    'community': (['play with viewers', 'viewer games', 'community night', 'join me', 'viewers join', 'custom games', 'lobbies', 'party games'],
                  ['queue', 'poll', 'alerts', 'chat']),
    'art': (['art', 'drawing', 'painting', 'study', 'study with me', 'coding', 'crafts', 'cooking', 'workout', 'gym'],
            ['alerts', 'goal', 'timer', 'chat']),
}

GENERIC = ['alerts', 'chat', 'goal', 'stats']
# 'full' adds these crowd-pleasers (in order) on top of the stream type's set
FULL_EXTRAS = ['celebrate', 'gifters', 'hearts', 'combos', 'jar', 'recent', 'emojis']

# Ways people ask for each overlay. Lists are [training words..., held-out words] (HOLDOUT decides).
ASK = {
    'alerts': ['alerts', 'alert box', 'popups', 'pop ups', 'notifications', 'follow alerts', 'gift alerts', 'shoutouts'],
    'chat': ['chat', 'chat box', 'comments', 'messages', 'chat overlay', 'live chat'],
    'combos': ['combos', 'gift combos', 'combo counter', 'gift streaks', 'streaks'],
    'hearts': ['hearts', 'like hearts', 'floating hearts', 'heart animation', 'love hearts'],
    'ticker': ['ticker', 'latest follower', 'latest events bar', 'news ticker', 'recent events bar'],
    'jar': ['jar', 'gift jar', 'coin jar', 'tip jar', 'donation jar'],
    'wheel': ['wheel', 'spin wheel', 'spinner', 'wheel of fortune', 'prize wheel', 'spin the wheel'],
    'battle': ['team battle', 'tug of war', 'red vs blue', 'team fight', 'battle bar'],
    'race': ['race', 'like race', 'racing', 'race to the finish', 'likes race'],
    'topgift': ['top gift', 'biggest gift', 'gift spotlight', 'top donation', 'best gift'],
    'emojis': ['emoji rain', 'emojis', 'emoji', 'raining emojis', 'emoji drop'],
    'celebrate': ['fireworks', 'confetti', 'celebrations', 'celebration effects', 'explosions'],
    'stats': ['stats', 'stats bar', 'viewer count', 'live stats', 'numbers', 'statistics'],
    'gifters': ['leaderboard', 'top gifters', 'top supporters', 'top fans', 'supporter board', 'rankings'],
    'counter': ['like counter', 'counter', 'big number', 'tap counter', 'number counter'],
    'timer': ['timer', 'countdown', 'subathon timer', 'clock', 'count down'],
    'record': ['wins and losses', 'win loss', 'record', 'w l', 'score', 'win streak', 'wins'],
    'poll': ['poll', 'voting', 'votes', 'vote', 'polls', 'chat vote'],
    'queue': ['queue', 'viewer queue', 'join list', 'waitlist', 'line', 'join queue'],
    'banner': ['banner', 'message bar', 'announcement', 'scrolling text', 'title bar', 'caption'],
    'recent': ['recent followers', 'new followers list', 'latest follows', 'follower list', 'recent gifts'],
    'camframe': ['camera frame', 'cam frame', 'facecam', 'webcam frame', 'cam border', 'border'],
    'goal': ['goal', 'goal bar', 'like goal', 'follower goal', 'progress bar', 'target'],
}
HOLDOUT = {'alerts': {'shoutouts'}, 'chat': {'live chat'}, 'jar': {'donation jar'}, 'wheel': {'spin the wheel'},
           'gifters': {'rankings'}, 'timer': {'count down'}, 'poll': {'chat vote'}, 'queue': {'join queue'},
           'banner': {'caption'}, 'goal': {'target'}, 'stats': {'statistics'}, 'camframe': {'border'}}

COLOURS = {'red': ['red', 'crimson', 'cherry'], 'pink': ['pink', 'hot pink', 'rose pink', 'barbie'], 'purple': ['purple', 'violet', 'lilac'],
           'blue': ['blue', 'navy', 'royal blue'], 'cyan': ['cyan', 'aqua', 'teal', 'turquoise'], 'green': ['green', 'lime', 'neon green', 'mint'],
           'yellow': ['yellow', 'lemon'], 'orange': ['orange', 'sunset'], 'gold': ['gold', 'golden', 'luxury']}
COLOUR_HOLDOUT = {'cherry', 'lilac', 'turquoise', 'lemon'}

INTROS = ['', '', 'make me', 'make', 'create', 'build', 'i want', 'i need', 'give me', 'can you make', 'pls make', 'yo make me', 'generate', 'set up',
          'design', 'id like', 'could you build', 'can i get', 'make a', 'need a', 'gimme', 'do a']
LAYOUT_WORDS = ['layout', 'setup', 'overlay', 'overlays', 'stream layout', 'scene', 'live setup', 'design', 'screen', 'set up', 'overlay pack']
FOR_WORDS = ['for my', 'for a', 'for', 'for my tiktok', 'for tiktok', 'for my live', '']
WITH_WORDS = ['with', 'with a', 'and', 'plus', 'that has', 'include', 'add', 'w/', 'and also', 'featuring']
NEG_WORDS = ['no', 'without', 'without the', 'dont want', 'dont add', 'remove the', 'no need for', 'skip the', 'not', 'minus the', 'ditch the', 'nah to']
FILLER = ['', '', '', 'pls', 'please', 'thx', 'fr', 'lowkey', 'asap', 'bro', 'thanks', 'ty', 'rn', 'that looks clean', 'make it look good', 'nothing crazy']
LANDSCAPE = ['landscape', 'horizontal', 'widescreen', '16:9', 'pc stream', 'sideways', 'desktop', 'wide']
PORTRAIT = ['portrait', 'vertical', 'phone', 'mobile', '9:16', 'upright']
WHITE = ['white', 'light', 'light mode', 'white theme', 'bright', 'clean white']
BLACK = ['black', 'dark', 'dark mode', 'black theme', 'night mode']
MINIMAL = ['minimal', 'simple', 'clean', 'basic', 'not too much', 'just the basics', 'lightweight', 'small']
FULL = ['full', 'everything', 'packed', 'all the overlays', 'loaded', 'maximum', 'busy', 'all of it', 'go crazy']
GOAL_WORDS = {'likes': ['like goal', 'likes goal', 'tap goal'], 'follows': ['follower goal', 'follow goal', 'followers goal', 'sub goal'],
              'coins': ['coin goal', 'gift goal', 'money goal', 'coins goal']}


ALL_WORDS = os.environ.get('ALL_WORDS') == '1'  # final model: train on every phrasing, hold-outs included


def pick(rng, words, held, test):
    if ALL_WORDS and not test:
        return rng.choice(words)
    pool = [w for w in words if (w in held) == test] if test else [w for w in words if w not in held]
    return rng.choice(pool or words)


def typo(rng, s):
    if len(s) < 5 or rng.random() > 0.18:
        return s
    i = rng.randrange(1, len(s) - 1)
    r = rng.random()
    if r < 0.4: return s[:i] + s[i + 1:]                          # dropped letter
    if r < 0.7: return s[:i] + s[i + 1] + s[i] + s[i + 2:]          # swapped letters
    return s[:i] + s[i] + s[i:]                                    # doubled letter


def example(rng, test=False):
    kind = rng.choice(list(STREAM_TYPES))
    names, base = STREAM_TYPES[kind]
    density = rng.choices(DENSITY, [0.2, 0.6, 0.2])[0]
    mention_type = rng.random() < 0.85
    if not mention_type:
        base = GENERIC  # the prompt doesn't say what kind of stream, so a general-purpose set is right
    chosen = list(base)
    if density == 'minimal':
        chosen = chosen[:2]
    elif density == 'full':
        chosen += [o for o in FULL_EXTRAS if o not in chosen][:3]

    parts = []
    # explicit adds
    adds = rng.sample(OVERLAYS, rng.choice([0, 0, 1, 1, 2, 3]))
    # explicit removes (only of things that would be there)
    r = rng.random()
    removes = rng.sample(chosen, min(len(chosen), 2 if r < 0.12 else 1)) if chosen and r < 0.4 else []
    for o in adds:
        if o not in chosen: chosen.append(o)
    for o in removes:
        if o in chosen: chosen.remove(o)
        if o in adds: adds.remove(o)

    goal = rng.choice(GOAL)
    goal_word = None
    if 'goal' in chosen and rng.random() < 0.45:
        goal_word = rng.choice(GOAL_WORDS[goal])
    else:
        goal = 'likes'  # not asked for: the default (a random label here would be noise the model can't learn)

    orient = 'landscape' if rng.random() < 0.3 else 'portrait'
    theme = 'white' if rng.random() < 0.25 else 'black'
    accent = 'none' if rng.random() < 0.45 else rng.choice(ACCENT[1:])

    intro = rng.choice(INTROS)
    if intro: parts.append(intro)
    if density != 'normal' and rng.random() < 0.85:
        parts.append(rng.choice(MINIMAL if density == 'minimal' else FULL))
    if accent != 'none' and rng.random() < 0.5:
        parts.append(pick(rng, COLOURS[accent], COLOUR_HOLDOUT, test)); accent_said = True
    else:
        accent_said = False
    if theme == 'white' or rng.random() < 0.15:
        parts.append(rng.choice(WHITE if theme == 'white' else BLACK))
    if mention_type:
        parts.append(rng.choice(['', 'a ', 'my '][:2]) + rng.choice(names))
    if orient == 'landscape' or rng.random() < 0.2:
        parts.append(rng.choice(LANDSCAPE if orient == 'landscape' else PORTRAIT))
    parts.append(rng.choice(LAYOUT_WORDS))
    if rng.random() < 0.3: parts.append(rng.choice(FOR_WORDS))
    for o in adds:
        word = goal_word if (o == 'goal' and goal_word) else pick(rng, ASK[o], HOLDOUT.get(o, set()), test)
        parts.append(rng.choice(WITH_WORDS) + ' ' + word)
    if goal_word and 'goal' not in adds:
        parts.append(rng.choice(WITH_WORDS) + ' ' + goal_word)
    for o in removes:
        parts.append(rng.choice(NEG_WORDS) + ' ' + pick(rng, ASK[o], HOLDOUT.get(o, set()), test))
    if accent != 'none' and not accent_said:
        word = pick(rng, COLOURS[accent], COLOUR_HOLDOUT, test)
        parts.append(rng.choice(['in', 'make it', 'colour', 'color', 'with', 'in a', 'all']) + ' ' + word)
    parts.append(rng.choice(FILLER))
    text = ' '.join(p for p in parts if p).strip()
    text = ' '.join(typo(rng, w) for w in text.split())
    r = rng.random()
    if r < 0.12: text = text.upper()
    elif r < 0.4: text = text.capitalize()
    return {
        'text': text,
        'overlays': [1 if o in chosen else 0 for o in OVERLAYS],
        'orient': ORIENT.index(orient), 'theme': THEME.index(theme), 'accent': ACCENT.index(accent),
        'goal': GOAL.index(goal), 'density': DENSITY.index(density),
    }


def main():
    os.makedirs('data', exist_ok=True)
    for name, n, seed, test in [('train', int(os.environ.get('N', 120000)), 1, False), ('val', 3000, 2, False), ('test', 3000, 3, True)]:
        rng = random.Random(seed)
        with open(f'data/{name}.jsonl', 'w') as f:
            for _ in range(n):
                f.write(json.dumps(example(rng, test)) + '\n')
        print('wrote', name, n)


if __name__ == '__main__':
    main()
