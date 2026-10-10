# Third-party notices

## Exercise library data — `src__lib__catalog.json`

Exercise names, equipment, target and secondary muscles, and English instruction steps come from
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (commit
`7455efa`), trimmed to the fields this app uses. The content originates from ExerciseDB v1 by
AscendAPI. Used under the MIT License:

```
MIT License

Copyright (c) 2026 Hasan Emir Yıldırım

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation and data files (the "Software"),
to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

------------------------------------------------------------------------------
MEDIA EXCEPTION
------------------------------------------------------------------------------

The MIT license above covers ONLY the code, tooling, dataset structure, and
instruction text/translations in this repository.

It DOES NOT cover the exercise media in the `images/` and `videos/`
directories. That media is © Gym visual (https://gymvisual.com/) and is
included here with the rights holder's written permission, at 180×180
resolution, and must retain the attribution "© Gym visual —
https://gymvisual.com/". Its use and reuse are governed by Gym visual's Terms
& Conditions (https://gymvisual.com/content/3-terms-and-conditions-of-use) and
by `NOTICE.md` in this repository — NOT by the MIT license above. Cloning this
repository does not grant you any license to the media; obtain your own from
Gym visual.
```

## Exercise animations — not in this repository

The exercise animations are **© Gym visual — https://gymvisual.com/**. They are not included in
this repository or its image. The app loads them at runtime from jsDelivr's copy of the dataset
above, at 180×180, with that credit shown beside each one. That dataset redistributes them with
Gym visual's permission, which does not pass on to this app or to you; see Gym visual's
[terms](https://gymvisual.com/content/3-terms-and-conditions-of-use) before reusing them.

## Body map outlines — `src__lib__body-paths.json`

The front and back body outlines are converted from the Swift path data in
[melihcolpan/MuscleMap](https://github.com/melihcolpan/MuscleMap) (male figure, main muscle groups,
sub-group shapes dropped, artwork otherwise unchanged). Used under the MIT License:

```
MIT License

Copyright (c) 2026 Melih Colpan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Quest Mode sprites — `quest/sprites/`

All CC0 1.0 (see `quest/LICENSE-sprites.txt`):
- Monster, pet and knight sprites, dungeon tiles: 16x16 DungeonTileset II by 0x72 (https://0x72.itch.io/dungeontileset-ii).
- Heroes (samurai, ronin, brawler, kings, warlord, sellsword, iron guard, huntress, archer, wizard,
  warlock, sorcerer, hexblade): LuizMelo packs (https://luizmelo.itch.io).
- Landscape layers (`land_*.png`): ansimuz — Mountain Dusk Parallax background
  (https://ansimuz.itch.io/mountain-dusk-parallax-background).

## Quest Mode vault art — `quest/art/`

The 31 illustrations the Card Vault dithers came with the Quest Mode design handoff **without a
licence or source attribution**, and at least one carries a third-party watermark. They are included
at the repo owner's direction; their copyright belongs to their original creators, not to this
project. If you are a rights holder and want an image removed, open an issue. Anyone reusing this
repo should replace them with their own art — the in-app Forge does that per card slot.

## Card dither engine — `src__lib__dither.js`

From the Quest Mode design handoff (`dither-kit.js`), made into an ES module.
