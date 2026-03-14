# Big Five Personality Assessment - Interactive 3D Games

**Live:** https://ghollisjr.github.io/aboutyou/

## Project Overview

A personality assessment system using 5 interactive 3D games to measure the Big Five (OCEAN) personality traits. Each game subtly measures one trait through engaging gameplay mechanics rather than explicit questions.

## Goals

- **Non-obvious assessment**: Players shouldn't realize they're being tested
- **Engaging gameplay**: Fun, artistic, interactive experiences
- **GitHub Pages deployment**: Built with Vite, deployed via GitHub Actions
- **Accurate scoring**: Each game outputs a 0-1 score for its trait

## Tech Stack

- **Vite** (build tool with `@vitejs/plugin-react`)
- **React 19** (via npm)
- **Three.js** (3D graphics)
- **GitHub Actions** (CI/CD to GitHub Pages)

## Project Structure

```
personality/                        # Repo root
├── index.html                      # Level-select menu (retro arcade)
├── vite.config.js                  # Vite config (multi-page, base: /aboutyou/)
├── package.json                    # npm scripts: dev, build, preview
├── .gitignore                      # node_modules/, dist/
├── museum-3d.jsx         # Game 1: Openness component (COMPLETE)
├── src/
│   ├── museum-main.jsx             # Entry point for museum game
│   └── museum-main.css             # Reset styles for museum game
├── games/
│   └── museum.html                 # HTML shell for museum game
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Actions Pages deployment
├── PROJECT-README.md               # This file
└── README.org                      # Quick-start and prompts
```

## Game Design Philosophy

Each game measures personality through **behavior**, not questions:

1. **Openness** (COMPLETE): Exploration, curiosity, novelty-seeking
2. **Conscientiousness** (TODO): Planning, organization, delayed gratification
3. **Extraversion** (TODO): Social engagement, energy, stimulation preference
4. **Agreeableness** (TODO): Cooperation, fairness, compassion
5. **Neuroticism** (TODO): Stress response, anxiety, emotional stability

---

## GAME 1: MUSEUM (Openness)

### Concept
Explore a 3D art gallery. Find art pieces, discover hidden areas, and optionally press a "trip balls" button for a psychedelic challenge.

### Mechanics

**Sober Mode:**
- Walk through museum (WASD/arrows)
- Examine 6 art pieces (click/tap/A button)
- Find hidden area behind interior walls
- Completion: Examine all 6 pieces

**Trip Mode (Optional):**
- Press glowing button in center
- Teleported to random position
- Orthographic camera (flattened depth)
- Psychedelic shader background (animated rainbow patterns)
- Flying controls (Q/Space = up, E/Shift = down)
- Navigate to 3D alignment box
- Align view with 5 colored circles
- Hold alignment for 2 seconds to exit

### Scoring

```javascript
if (completionMethod === 'sober') {
    // Found all objects without taking risks
    score = exploration * 0.5 + hiddenAreas * 0.3 + rotations * 0.2
} else if (completionMethod === 'trip') {
    // Took risks, navigated altered reality (MAX openness!)
    score = exploration * 0.3 + hiddenAreas * 0.2 + 0.4 (trip bonus)
} else {
    // Left early (penalized)
    score = (completionRatio * 0.4 + ...) * 0.7
}
```

### Controls

**Desktop:**
- WASD/Arrows: Move
- Mouse: Look around
- Click: Interact
- Q/Space: Fly up (trip mode)
- E/Shift: Fly down (trip mode)

**Gamepad:**
- Left stick: Move
- Right stick: Look
- A button: Interact
- L1/LB: Fly up (trip mode)
- L2/LT: Fly down (trip mode)

**Mobile:**
- Left touch zone: Virtual joystick (move)
- Right touch zone: Drag to look
- Tap objects: Interact

### Technical Details

**Key Components:**
- Perspective camera (sober) / Orthographic camera (trip)
- Collision detection (AABB)
- Billboard sprites (circles always face camera)
- Post-processing shader (psychedelic effect)
- Multi-platform input handling

**Shader Effect:**
- Animated UV-space patterns (sin/cos waves)
- RGB channels modulated at different frequencies
- Time-based animation (elapsed seconds since trip start)
- Circles rendered on top with glow

### Files
- `museum-3d.jsx` - Component source (single source of truth)
- `src/museum-main.jsx` - Entry point (imports component, renders App)
- `games/museum.html` - HTML shell

---

## Development Workflow

### 1. Local Development

```bash
npm install       # First time only
npm run dev       # Start Vite dev server
```

Open the localhost URL shown by Vite. Hot module replacement is enabled.

### 2. Building for Production

```bash
npm run build     # Output to dist/
npm run preview   # Preview built output locally
```

### 3. Deployment

Push to `main` branch. The GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically:
1. Checks out the code
2. Installs dependencies (`npm ci`)
3. Builds (`npm run build`)
4. Deploys `dist/` to GitHub Pages

Live URL: `https://ghollisjr.github.io/aboutyou/`

### 4. Embedding in Webflow

```html
<iframe
    src="https://ghollisjr.github.io/aboutyou/games/museum.html"
    width="100%"
    height="800px"
    frameborder="0"
    allow="gamepad">
</iframe>
```

Receive results (optional):
```html
<script>
window.addEventListener('message', function(event) {
    if (event.data.type === 'MUSEUM_COMPLETE') {
        const results = event.data.data;
        console.log('Score:', results.abstractnessLevel);
        // Save to backend, show results page, etc.
    }
});
</script>
```

---

## Component Interface

All games must implement this interface:

```javascript
const GameComponent = ({ onComplete }) => {
    // Game logic here

    const handleFinish = () => {
        onComplete({
            traitScore: 0.75,           // 0.0 to 1.0
            completionMethod: 'normal',  // Game-specific
            metricsCollected: {},        // Optional extra data
            completionRatio: 1.0         // 0.0 to 1.0
        });
    };

    return (/* JSX */);
};

export default GameComponent;
```

**Required:**
- Accept `onComplete` prop (function)
- Call `onComplete(results)` when game finishes
- Return score between 0.0 and 1.0
- Use `export default` (Vite handles module bundling)

**Results Object:**
```javascript
{
    traitScore: number,          // 0.0 to 1.0 (primary score)
    completionMethod: string,    // How they finished
    completionRatio: number,     // 0.0 to 1.0 (% completed)
    [custom metrics]: any        // Game-specific data
}
```

---

## Common Patterns & Solutions

### Time Management
```javascript
// CORRECT: Use performance.now()
let startTime = performance.now();
const elapsed = (performance.now() - startTime) / 1000; // seconds

// WRONG: Don't use Date.now() for game timing
```

### Shader Time
```javascript
// Pass elapsed seconds to shader
tripShaderMaterial.uniforms.time.value = elapsedSeconds;

// In shader, use directly (time is in seconds)
float animation = sin(uv.x * 10.0 + time * 2.0);
```

### Three.js Camera Setup
```javascript
// Perspective (normal 3D)
const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);

// Orthographic (flattened Z, all depths visible)
const orthoCamera = new THREE.OrthographicCamera(
    -size * aspect, size * aspect,
    size, -size,
    0.1, 1000
);
```

### Collision Detection (AABB)
```javascript
function checkCollision(x, z, radius = 0.5) {
    for (const wall of walls) {
        const hw = wall.width / 2;
        const hd = wall.depth / 2;
        if (x + radius > wall.x - hw &&
            x - radius < wall.x + hw &&
            z + radius > wall.z - hd &&
            z - radius < wall.z + hd) {
            return true;
        }
    }
    return false;
}
```

---

## Next Games To Build

### Game 2: Builder (Conscientiousness)
**Concept:** Resource management and planning

**Possible Mechanics:**
- Limited resources to build something
- Must plan ahead vs. act impulsively
- Delayed gratification (save now, bigger reward later)
- Organization of inventory/workspace
- Time pressure vs. careful planning

**Scoring:**
- High: Efficient planning, delayed gratification, organized approach
- Low: Impulsive actions, poor resource management, disorganized

---

### Game 3: Gathering (Extraversion)
**Concept:** Social scenario simulation

**Possible Mechanics:**
- Virtual social gathering environment
- Choose level of interaction
- Energy meter (introverts drain, extraverts gain)
- Conversation initiation vs. passive observation
- Group activity vs. solo corners

**Scoring:**
- High: Seeks interaction, initiates conversations, stays energized
- Low: Prefers solitude, drains quickly, minimal interaction

---

### Game 4: Dilemma (Agreeableness)
**Concept:** Ethical choices and cooperation

**Possible Mechanics:**
- Resource sharing scenarios
- Help others vs. self-interest
- Fairness puzzles (distribute resources)
- Competitive vs. cooperative paths
- Trust exercises

**Scoring:**
- High: Cooperative, fair, helps others, trusting
- Low: Competitive, self-interested, skeptical

---

### Game 5: Uncertainty (Neuroticism)
**Concept:** Stress and ambiguity management

**Possible Mechanics:**
- Increasing pressure/difficulty
- Ambiguous threats or challenges
- Emotional response to setbacks
- Risk assessment under stress
- Recovery from failures

**Scoring:**
- High: Anxious responses, risk-averse, poor stress recovery
- Low: Calm under pressure, resilient, balanced risk-taking

---

## Adding a New Game

1. Create `new-game.jsx` component at repo root (with `export default`)
2. Create `src/new-game-main.jsx` entry point:
   ```jsx
   import React from 'react';
   import ReactDOM from 'react-dom/client';
   import NewGame from '../new-game.jsx';
   import './new-game-main.css';

   function App() {
     const handleComplete = (results) => {
       console.log('Game completed!', results);
       if (window.parent !== window) {
         window.parent.postMessage({ type: 'GAME_COMPLETE', data: results }, '*');
       }
     };
     return <NewGame onComplete={handleComplete} />;
   }

   ReactDOM.createRoot(document.getElementById('root')).render(<App />);
   ```
3. Create `games/new-game.html` shell:
   ```html
   <!DOCTYPE html>
   <html lang="en">
   <head>
       <meta charset="UTF-8">
       <meta name="viewport" content="width=device-width, initial-scale=1.0">
       <title>New Game</title>
   </head>
   <body>
       <div id="root"></div>
       <script type="module" src="../src/new-game-main.jsx"></script>
   </body>
   </html>
   ```
4. Add to `vite.config.js` rollup inputs:
   ```js
   input: {
     main: resolve(__dirname, 'index.html'),
     museum: resolve(__dirname, 'games/museum.html'),
     newgame: resolve(__dirname, 'games/new-game.html'),
   }
   ```
5. Update `index.html` card from "Coming Soon" to playable (add `<a href>` link)

---

## Project Status

- [x] Game 1: Museum (Openness)
- [ ] Game 2: Builder (Conscientiousness)
- [ ] Game 3: Gathering (Extraversion)
- [ ] Game 4: Dilemma (Agreeableness)
- [ ] Game 5: Uncertainty (Neuroticism)
- [ ] Integration: Combined assessment flow
- [ ] Results: Similarity scoring vs. artist benchmark

---

## Troubleshooting

### Vite Dev Server Issues
```bash
# Kill process on default port
lsof -ti:5173 | xargs kill -9

# Or specify a different port
npm run dev -- --port 3000
```

### Build Chunk Size Warning
Three.js produces a large bundle (~727KB). This is expected. To reduce:
- Use dynamic `import()` to code-split Three.js
- Adjust `build.chunkSizeWarningLimit` in `vite.config.js`

---

## Resources

### Useful Three.js Patterns
- Raycasting: Detect clicks on 3D objects
- Billboard sprites: Objects always face camera
- Post-processing: Full-screen shader effects
- Collision: AABB for simple box collisions
- Input: Keyboard, mouse, touch, gamepad all supported

---

## Contact / Notes

This is an experimental art project measuring personality through interactive gameplay.

**Key Insight:** Museum showed that complex 3D environments work well, but simpler mechanics might be better for remaining games to avoid fatigue.

**Learned:**
- Orthographic camera creates unique "all visible at once" effect
- Shader effects must be carefully tuned (time units, intensity)
- Multi-platform input is essential (desktop, mobile, gamepad)
- Flying controls feel more "trippy" than walking on ground
