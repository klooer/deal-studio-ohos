#!/usr/bin/env python3
"""
Live-Jev precision check for the canned-template selector
(a hand transcription of the two-template selector that VeraTemplateSelect.ets held until it was removed).

This is a host-side harness, but unlike the SDK/UI selectors' eval scripts it
cannot replay anything locally: Jev's judgement is exactly what is under
test, so every gold row costs one live POST to the real endpoint (cached
after the first call, see --cache).

This is a hand transcription of buildSelectRequest/readPick's request shape
and gating logic (templates, slots, veto questions, PICK_ABOVE, and each
veto's own `above` bar -- VetoSpec.above in VeraTemplates.ets, not one shared
constant; the gold-set sweep that produced this script's VETOES list found no
single cutoff separates every question's true-accept distribution from its
true-reject distribution at once). The app no longer has that selector (the app picks sections through
VeraSectionCompose.ets), so this script is a frozen record of the measurement behind the per-veto
thresholds in VeraTemplates.ets and no longer tracks the app.

Usage:
    export TYPESAFE_API_KEY=sk-...
    python3 tools/template-select-eval.py --gold docs/prompts/template-select-gold.json
    python3 tools/template-select-eval.py --gold docs/prompts/template-select-gold-stretch.json
    # sweep --pick-above against already-cached responses, no new network calls
    # (per-veto `above` values live in the VETOES list above and need an edit, not a flag):
    python3 tools/template-select-eval.py --pick-above 0.6 --cache /tmp/template-select-cache.json
"""

import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
MODEL = 'jev-latest'

# Keep these three in lockstep with VeraTemplates.ets's templates()/listDetailSlots()/
# dashboardSlots(); the 'criteria' / 'instructions' strings are copied verbatim.
TEMPLATES = [
    {
        'id': 'list_detail',
        'criteria': 'A browsable list of items the person can check off or mark one at a time',
        'slots': [
            ('theme', 'choice', 'Which look fits best: clean (restrained), soft (calm, friendly) or expressive (bold)?',
             {'clean': 'restrained and neutral', 'soft': 'calm and friendly', 'expressive': 'bold and atmospheric'}),
            ('header_style', 'choice', 'Should the title block be left-aligned (default) or centered?',
             {'default': 'left-aligned', 'center': 'centered'}),
            ('list_style', 'choice', 'How dense should the list rows be?',
             {'default': 'normal spacing', 'compact': 'tighter spacing', 'comfortable': 'looser spacing'}),
            ('banner_section', 'noul', 'Does this app need a standing info note visible at all times?',
             {'true': 'yes, show one', 'false': 'no'}),
        ],
    },
    {
        'id': 'dashboard',
        'criteria': 'A small dashboard of a few summary numbers with a couple of actions',
        'slots': [
            ('theme', 'choice', 'Which look fits best: clean (restrained), technical (dense, precise) or playful (energetic)?',
             {'clean': 'restrained and neutral', 'technical': 'dense, precise numbers', 'playful': 'energetic'}),
            ('metric_style', 'choice', 'How dense should the summary numbers be?',
             {'default': 'normal spacing', 'compact': 'tighter spacing', 'spacious': 'looser spacing'}),
            ('accent_stat', 'choice', 'Should the middle number stand out with an accent tone?',
             {'default': 'no, same tone as the rest', 'accent': 'yes, highlighted'}),
            ('banner_section', 'noul', 'Does this app need a standing info note visible at all times?',
             {'true': 'yes, show one', 'false': 'no'}),
        ],
    },
]

# Keep in lockstep with VeraTemplates.ets's vetoes(). Each tuple is
# (key, instructions, criteria, above) -- `above` is that question's own
# threshold (VetoSpec.above), not a single shared constant: the sweep below
# found that one shared cutoff cannot separate every question's true-accept
# distribution from its true-reject distribution at once.
VETOES = [
    ('needs_integration',
     'Does fulfilling this request need calling any phone API, SDK function, or app intent, or '
     'integrating with another app (navigation, calendar, messaging, camera, contacts, etc.) to '
     'read or act on real device/world state -- rather than only showing or manually updating '
     'numbers or items the app keeps for itself (even if a complete, faithful version of this app '
     'would eventually read one of these from a sensor or a real API)?',
     {'true': 'yes', 'false': 'no, everything stays inside the app'}, 0.3),
    ('needs_real_data',
     'Does this request need particular real, named, or externally-sourced information (real '
     'places, real contacts, real recipes, real prices, etc.) rather than generic interchangeable '
     'placeholder content?',
     {'true': 'yes', 'false': 'no, generic placeholder content is fine'}, 0.35),
    ('needs_search_or_form',
     'Does this request need the person to search, filter, or sort a list, or fill in a multi-'
     'field form (several distinct labeled fields in one entry), rather than just tapping a plain '
     'row or a plain number? A plain list of items or a few plain numbers do not count on their '
     'own just because a complete, faithful version of the app would eventually let someone add, '
     'remove or log an arbitrary number of them.',
     {'true': 'yes', 'false': 'no, tapping a plain row or a plain number is enough'}, 0.6),
    ('needs_live_ticking',
     'Does this request need a display that visibly ticks, counts down, or updates continuously '
     'on screen in real time by itself, like a running stopwatch or a live clock face -- rather '
     'than a number that only changes when the person taps something? A number that in real life '
     'would be measured or accumulated automatically over time (step count, water intake, '
     'calories, distance) still counts as a plain tap-to-change number here if it is simply shown '
     'as a static daily or periodic total, not a continuously ticking display.',
     {'true': 'yes', 'false': 'no continuously updating display is needed'}, 0.3),
    ('needs_multiple_counters',
     'Does this request need two or more separate NUMERIC counters or running totals that each '
     'independently go up or down, one per distinct person or thing -- for example one score per '
     'player in a multiplayer game -- rather than a single adjustable number shown alongside other '
     'read-only derived numbers like a total or a remaining amount? A list of items that are each '
     'just marked done/not done, present/absent, or on/off is one list, not multiple counters, and '
     'does not count -- only answer yes for genuinely separate running numeric tallies.',
     {'true': 'yes', 'false': 'no, one adjustable number (plus derived read-only numbers) is enough'}, 0.65),
]

TEMPLATE_NONE_CRITERIA = (
    'neither of these fits the request -- including when it needs real or named data, a phone API '
    'or app/intent integration, or capability beyond a short generic list or a couple of generic numbers'
)
TEMPLATE_INSTRUCTIONS = (
    'Which of these screen shapes best fits what the person described? Answer none if neither '
    'clearly fits, or if the request needs anything beyond generic placeholder content and simple '
    'taps -- real data, search, charts, forms, or calling any phone API, SDK function or other app.'
)


def build_request(prompt: str) -> dict:
    questions = {}
    criteria = {t['id']: t['criteria'] for t in TEMPLATES}
    criteria['none'] = TEMPLATE_NONE_CRITERIA
    questions['template'] = {'type': 'choice', 'instructions': TEMPLATE_INSTRUCTIONS, 'criteria': criteria}
    for t in TEMPLATES:
        for key, kind, instructions, crit in t['slots']:
            questions[f"{t['id']}.{key}"] = {'type': kind, 'instructions': instructions, 'criteria': crit}
    for key, instructions, crit, _above in VETOES:
        questions[f'veto.{key}'] = {'type': 'noul', 'instructions': instructions, 'criteria': crit}
    return {'model': MODEL, 'state': prompt, 'questions': questions}


def classify(answers: dict, pick_above: float) -> tuple:
    """Mirrors readPick's gating. Returns (verdict, note); verdict is 'none', 'vetoed',
    or a template id."""
    ta = answers.get('template')
    if not isinstance(ta, dict):
        return 'none', 'no template answer'
    choice = ta.get('choice')
    if not isinstance(choice, str):
        return 'none', 'no template answer'
    if choice == 'none':
        return 'none', 'Jev said none'
    if choice not in (t['id'] for t in TEMPLATES):
        return 'none', 'unknown template'
    conf = ta.get('confidence', 1)
    if not isinstance(conf, (int, float)):
        conf = 1
    if conf < pick_above:
        return 'none', f'template confidence {conf:.2f}'
    hits = []
    for key, _instructions, _crit, above in VETOES:
        ans = answers.get(f'veto.{key}')
        prob = 1.0
        if isinstance(ans, dict):
            val = ans.get('noul')
            if isinstance(val, (int, float)):
                prob = val
        if prob > above:
            hits.append(f'{key}={prob:.2f}')
    if hits:
        return 'vetoed', ' '.join(hits) + f' (would have been {choice} {conf:.2f})'
    return choice, f'{choice} ({conf:.2f})'


def cache_key(body: dict) -> str:
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode('utf-8')).hexdigest()


def call_jev(body: dict, api_key: str) -> dict:
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(ENDPOINT, data=data, method='POST', headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}',
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'HTTP {e.code}: {e.read().decode("utf-8", "replace")[:300]}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--gold', type=Path, default=Path(__file__).resolve().parent.parent / 'docs/prompts/template-select-gold.json')
    ap.add_argument('--cache', type=Path, help='path to a JSON cache of raw Jev responses, keyed by request-body hash')
    ap.add_argument('--refresh', action='store_true', help='re-query Jev even for rows already in the cache')
    ap.add_argument('--pick-above', type=float, default=0.5)
    ap.add_argument('--api-key-env', default='TYPESAFE_API_KEY')
    args = ap.parse_args()

    api_key = os.environ.get(args.api_key_env, '')
    cache = {}
    if args.cache and args.cache.exists():
        cache = json.loads(args.cache.read_text())

    gold = json.loads(args.gold.read_text())
    rows = []
    network_calls = 0
    for case in gold:
        body = build_request(case['prompt'])
        key = cache_key(body)
        response = cache.get(key)
        if response is None or args.refresh:
            if not api_key:
                print(f'error: ${args.api_key_env} is not set and no cached response for "{case["id"]}"', file=sys.stderr)
                sys.exit(1)
            response = call_jev(body, api_key)
            cache[key] = response
            network_calls += 1
        answers = response.get('answers', {})
        verdict, note = classify(answers, args.pick_above)
        rows.append({'id': case['id'], 'gold': case['label'], 'verdict': verdict, 'note': note})

    if args.cache:
        args.cache.write_text(json.dumps(cache))

    counts = {'false_accept': 0, 'true_accept': 0, 'false_reject': 0, 'true_reject': 0}
    mismatches = []
    for r in rows:
        is_template_verdict = r['verdict'] not in ('none', 'vetoed')
        if r['gold'] == 'none':
            if is_template_verdict:
                counts['false_accept'] += 1
                mismatches.append(r)
            else:
                counts['true_reject'] += 1
        else:
            if r['verdict'] == r['gold']:
                counts['true_accept'] += 1
            else:
                counts['false_reject'] += 1
                mismatches.append(r)

    print(f"gold={args.gold.name} rows={len(rows)} network_calls={network_calls} "
          f"pick_above={args.pick_above}")
    print(f"  false_accept={counts['false_accept']}  true_accept={counts['true_accept']}  "
          f"false_reject={counts['false_reject']}  true_reject={counts['true_reject']}")
    if mismatches:
        print('\nmismatches:')
        for r in mismatches:
            print(f"  [{r['id']}] gold={r['gold']} verdict={r['verdict']}  ({r['note']})")
    sys.exit(1 if counts['false_accept'] > 0 or counts['false_reject'] > 0 else 0)


if __name__ == '__main__':
    main()
