# Needs plan: 25 prompts, fixed

The acceptance set for `--ps veraNeeds 1` against the old path. The list is fixed: do not add, drop or reword a prompt
after the first run, and do not tune a threshold on these (the 20 prompts of the first phone round are among them, so
they are not a held-out test; the last group is the one the flag has not been fitted to).

Prompts are in English. Each is run twice on the same build, `veraNeeds 0` and `veraNeeds 1`, and the two programs are
compared **by what is on the screen**, not by the plan. "Expect" is a hypothesis written before the run, not a gold
answer: P = a part, S = a catalogue section, H = a hole the model writes. A mismatch with it is a reason to look, not
a failure by itself.

Check on every screen (the same four, in this order):
1. everything the prompt asked for is there;
2. nothing extra: no second button for one effect, no figure shown twice, no input nobody uses;
3. numbers are right on a worked example (hours are not minutes, a total is the sum);
4. the controls work: tap, type, add, start/stop.

Mark each pair `new better` / `same` / `new worse` and write one line why. The decision is made on the count of `new worse`.

| # | group | prompt | expect | worked example / what else to check | old | new | verdict |
|---|---|---|---|---|---|---|---|
| 1 | timer | egg timer | P clock | length is a constant; Start/Reset | | | |
| 2 | timer | tea steeping timer: green 2 min, black 4, herbal 6, vibrate when ready | P clock + choice + effect | black -> 4:00; one vibrate, not two | | | |
| 3 | timer | plank timer for 60 seconds that beeps at the end | P clock + effect | starts at 1:00; one beep button/effect | | | |
| 4 | timer | stopwatch with laps | P clock (stopwatch) | Lap button and list, no add form | | | |
| 5 | timer | interval timer: work 30 s, rest 10 s, 8 rounds | P clock or H | rounds counted; hole is acceptable if said | | | |
| 6 | calc | BMI calculator, kg and metres | P inputs + figures | 70 kg, 1.75 m -> 22.9 | | | |
| 7 | calc | trip fuel cost: distance in km, litres per 100 km, price per litre | P inputs + figures | 200, 7, 1.5 -> 21.00 | | | |
| 8 | calc | split a restaurant bill between friends with a tip percent | P inputs + figures | 120, 4 people, 10% -> 33.00 each | | | |
| 9 | calc | savings goal: goal, saved so far, show percent and what is left | P inputs + figures | 1000 / 250 -> 25%, 750 | | | |
| 10 | log | expense log with total | S record_log or P list | add two, total is the sum; delete one | | | |
| 11 | log | shopping list where I can add and remove items | P list or S checklist | add, remove; nothing summed | | | |
| 12 | log | workout log: exercise, sets, reps, show how many sessions | S record_log | count is a count of entries | | | |
| 13 | log | reading log with pages, show average pages per session | S record_log | average of two entries; dash over none | | | |
| 14 | section | daily medicine reminders | S reminders | times can be added; no countdown invented | | | |
| 15 | section | beach packing checklist | S checklist | items tick; nothing else | | | |
| 16 | section | Rome 3 day itinerary | S itinerary | stops per day; none past the end of the plan | | | |
| 17 | section | add a dentist appointment to my calendar | S calendar_event | system call; says so if declined | | | |
| 18 | mixed | beach packing checklist and a timer for sunscreen reapply every 2 hours | S checklist + P clock | 2 h = 2:00:00, not 2:00; both present | | | |
| 19 | mixed | Rome 3 day itinerary and a log of what I spend | S itinerary + S/P log | the log is the person's own; total shown once | | | |
| 20 | mixed | pill reminders with a count of how many I took today | S reminders + figure | count reads the entries, not a typed number | | | |
| 21 | mixed | study timer 25 minutes and a log of sessions with total minutes | P clock + list/S log | total in minutes, not in seconds | | | |
| 22 | mixed | trip budget: list expenses, total, and what is left of 500 | list + figures | 500 is a constant; left = 500 - total | | | |
| 23 | hole | quiz game with 10 questions about capital cities | H or refusal | says what it cannot do, not a blank screen | | | |
| 24 | hole | show today's weather where I am | S live data / refusal | no invented numbers | | | |
| 25 | hole | notes app with search and tags | H or refusal | the first of the three that need a hole | | | |

Groups: 1-5 clock, 6-9 calculators (the parts alone), 10-13 records, 14-17 one catalogue section, 18-22 two needs together
(where the choice between a part and a section matters most), 23-25 what neither can do. 18 and 19 are the two from the
phone round; 14, 10, 1 and 18 too (`egg timer`, `expense log with total`, `daily medicine reminders`, the beach prompt).

## How a run is recorded

```
node tools/vera-harness/agent-run.js -o <dir>/old -p <this list as tsv>          # veraNeeds off
node tools/vera-harness/agent-run.js -o <dir>/new -p <this list as tsv> --needs  # veraNeeds on
```

(Flag names to be checked against `agent-run.js` before the first run.) Step one is automatic: parts, sections, holes,
widgets and formulas of each pair are diffed from `result.json`; a pair that is identical there is marked `same` without
a screenshot. Step two is a screenshot of both screens for every pair that differs, taken on the phone, with the four
checks above.

## First run (phone, one run per mode, the top of each screen only)

`veraNeeds 0` against `veraNeeds 1` on the same build. Clarifying questions asked by the new path were answered with the
suggested option. Buttons and formulas after input were not exercised.

| # | verdict | why |
|---|---|---|
| 1 | same | |
| 3 | new better | old 0:45 and an unasked progress bar; new 1:00 |
| 4 | new better | old counts laps as a figure; new has a lap list |
| 5 | new worse, **fixed** | new showed 5:00 and a length in minutes for 30 s / 10 s; after the fix 5:20 = (30 + 10) x 8 s, with Work and Rest shown |
| 6 | same | |
| 7 | new better (minor) | old adds fuel needed and cost per km, unasked |
| 10 | same | old adds an unasked count |
| 11 | new better | old shows items and total quantity, unasked |
| 14 | different | new uses the reminders section; not compared further |
| 17 | same | new asked a question first (+11.5 s) |
| 18 | new better | old 1:00:00 for "every 2 hours"; new 2:00:00 |
| 19 | same | the itinerary is there (the trace's note says `sections itinerary (real data)`); my log line for it had been lost, and it is below the part of the screen looked at |
| 20 | new better | new shows the count asked for; old an unasked goal bar |
| 21 | both wrong, new **fixed** | old 15:00, new 0:00; after the fix new shows 25:00 with a length input of 25 minutes (same cause as 5) |
| 22 | same | |
| 25 | new better | new has the search field |
| 9 | same | percent and what is left in both |
| 12 | new better | old adds an unasked "Total sets" |
| 23 | same | |

Not looked at on screen: 2, 8, 13, 15, 16, 24 (the same structure in the log in both modes).
Prompt 24 contains an apostrophe: it has to be escaped when typed through `uitest`.

## What the run found, and the fix

5 and 21 had one cause. The plan wrote a length of time as `"kind": "time", "measure": "seconds"`; the parser made every `time` a
time of day, so no expression could use it. For 5, Jev then took the round length as the countdown's duration over the rounds,
the countdown's length depended on the round length, and the composer, seeing the circle, made up a five-minute length. Two changes in
`VeraCompose.ets`: a `time` input whose measure is seconds or minutes is a number; and a figure a countdown's length is made of does
not read the clock (`lengthFeeders`). Host check `tools/vera-harness/length-feeders-check.js`, the plan it replays in
`tools/vera-harness/needs-plans/interval-rounds.json`. Re-run on the phone: 5 and 21 right; 3 (1:00) and 18 (2:00:00) unchanged.
