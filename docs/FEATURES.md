# Features Backlog

## Feature 1: PvP Unit Queue — Envoyer des unités chez l'adversaire
**Priority:** High | **Complexity:** High

Après le lobby, les joueurs peuvent envoyer des unités PvP chez un adversaire. Ces unités s'ajoutent **à la suite** de la vague de mobs et **attaquent les tours** du joueur ciblé.

### UI
- Grille/panel en **bas à gauche** de l'écran (à côté du shop)
- Liste d'unités PvP achetables (avec coût en gold)
- Clic sur une unité = **queue** pour la prochaine phase de combat
- Indicateur visuel du nombre d'unités en queue + cible choisie
- Sélecteur d'adversaire cible (dropdown ou clic sur le panel opponents)

### Gameplay
- Les unités PvP spawn après le dernier mob de la vague
- Elles suivent le même path que les mobs
- Elles **attaquent les tours** sur leur passage (dégâts aux tours = nouveau mécanisme)
- Les tours détruites doivent être rachetées
- Coût des unités PvP à balancer (probablement 5-15g selon le type)

### Tech
- Nouveau type `PvPUnit` dans shared (stats, behavior)
- Server: queue par joueur, broadcast aux clients ciblés
- Client: nouveau panel UI + spawn logic après la vague
- Sync: les dégâts aux tours doivent être confirmés côté serveur

---

## Feature 2: Actions joueur déverrouillées pendant toutes les phases
**Priority:** High | **Complexity:** Low
**Status:** ✅ DONE (commit `8e46f71`)

Les joueurs peuvent acheter, vendre et placer des tours même quand les mobs sont en jeu — plus besoin d'attendre la fin du round.

---

## Feature 3: Couleur de terrain au lobby
**Priority:** Medium | **Complexity:** Medium

Dans l'écran lobby, chaque joueur choisit sa couleur de terrain. Le background de sa grille change légèrement en fonction de la couleur choisie.

### UI
- Lobby: palette de couleurs (6-8 options) à côté du pseudo
- Chaque joueur voit la couleur des autres en temps réel
- Couleurs uniques (first-come first-served)

### Gameplay
- Purement cosmétique — pas d'impact gameplay
- Subtile teinte sur le terrain (10-15% saturation, comme décrit dans le GDD §7)
- Variations possibles : texture de terrain légèrement différente par couleur

### Tech
- Ajout `playerColor` dans le state joueur (lobby + game)
- Serveur: validation unicité dans la room
- Client: tint layer sur le tilemap de la grille

---

## Feature 4: Arbre combo des éléments (Tech Tree UI)
**Priority:** High | **Complexity:** Medium
**Status:** Partiellement fait (commit `daebce9` — Tower Upgrade System + Element Combo Tech Tree)

L'arbre tech affiche **tous les 21 combos** dual-element avec leur nom et effet. Les combos sont déjà définis dans `packages/shared/dist/combos.js`.

### 7 éléments, 21 combos
| Combo | Éléments | Effet |
|---|---|---|
| Plasma | ☀️ Solar + 🧊 Cryo | DoT + slow |
| Meteor | ☀️ Solar + 🪨 Asteroid | Burning impact zones |
| Eclipse | ☀️ Solar + 🕳️ Void | Speed drain → bonus dmg |
| Supernova | ☀️ Solar + ⚡ Photon | AoE burst every 5th hit |
| Radiation | ☀️ Solar + 🧬 Bio | Max HP reduction |
| Corona | ☀️ Solar + 🌀 Nebula | Passive damage aura |
| Comet | 🧊 Cryo + 🪨 Asteroid | Shatter splash |
| Absolute Zero | 🧊 Cryo + 🕳️ Void | Freeze chance |
| Prism | 🧊 Cryo + ⚡ Photon | Split into 3 beams |
| Cryogenics | 🧊 Cryo + 🧬 Bio | Stack → freeze |
| Frost Cloud | 🧊 Cryo + 🌀 Nebula | Frost zone on death |
| Black Hole | 🪨 Asteroid + 🕳️ Void | Gravity pull |
| Crystal | 🪨 Asteroid + ⚡ Photon | Ramp damage |
| Fossil | 🪨 Asteroid + 🧬 Bio | Death trap |
| Dust Storm | 🪨 Asteroid + 🌀 Nebula | AoE slow |
| Antimatter | 🕳️ Void + ⚡ Photon | % max HP bonus |
| Parasite | 🕳️ Void + 🧬 Bio | Chain damage |
| Dark Matter | 🕳️ Void + 🌀 Nebula | Ignore armor |
| Bioluminescence | ⚡ Photon + 🧬 Bio | Heal tower CDs |
| Aurora | ⚡ Photon + 🌀 Nebula | Cycling weakness hit |
| Spore Cloud | 🧬 Bio + 🌀 Nebula | Stacking DoT |

### TODO restant
- Vérifier que le panel in-game affiche bien les 21 combos
- Highlight des combos unlockés par le joueur
- Tooltip avec stats détaillées au hover
- Indication des éléments manquants pour débloquer un combo

---

## Feature 5: Raccourcis clavier (style TFT)
**Priority:** High | **Complexity:** Medium

Actuellement seul ESC est mappé. Ajouter les raccourcis standards TFT.

### Raccourcis proposés
| Touche | Action |
|---|---|
| `D` | Reroll shop |
| `F` | Level up / Buy XP |
| `E` | Sell selected tower |
| `W` | Move/pick up selected tower |
| `1-5` | Acheter le slot shop correspondant |
| `Q` | Toggle lock shop |
| `Space` | Toggle speed (si spectateur) |
| `Tab` | Cycle entre les boards adverses |
| `ESC` | Fermer menu / déselectionner (déjà fait) |

### Tech
- `GameScene.ts`: ajouter les bindings keyboard Phaser
- Afficher les raccourcis en petit sur les boutons correspondants
- Option pour voir la liste complète (tooltip ou panel `?`)

---

## Feature 6: Prochaine vague — Info mobs dans le HUD
**Priority:** High | **Complexity:** Low

Afficher dans le menu/HUD principal le **type de la prochaine vague** avec ses résistances et faiblesses élémentaires.

### UI
- Encart "Next Wave" dans la top bar ou à côté du round counter
- Icône du type de mob + nom (Grunt, Runner, Tank, Swarm, Flying, Boss)
- Icônes des éléments : vert = faible contre, rouge = résistant à
- Exemple : `Next: 🏃 Runner — Weak: ☀️🪨 | Resist: 🧊🕳️`

### Pourquoi
- Permet au joueur de préparer ses upgrades et placements
- Ajoute de la stratégie (acheter des cristaux du bon élément)
- Standard dans les TD modernes

### Tech
- Le serveur connaît déjà les vagues (wave definitions)
- Broadcast du type de la vague N+1 à la fin de chaque round
- Client: petit composant UI dans la top bar

---

*Fichier créé le 2026-02-22. Prioriser Features 1, 5, 6 pour le prochain sprint.*
