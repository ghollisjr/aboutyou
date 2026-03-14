# Big Five Personality Assessment - Interactive 3D Games

## Project Overview

A personality assessment system using 5 interactive 3D games to measure the Big Five (OCEAN) personality traits. Each game subtly measures one trait through engaging gameplay mechanics rather than explicit questions.

## Goals

- **Non-obvious assessment**: Players shouldn't realize they're being tested
- **Engaging gameplay**: Fun, artistic, interactive experiences
- **Webflow integration**: Embeddable via iframe in Webflow pages
- **Accurate scoring**: Each game outputs a 0-1 score for its trait

## Tech Stack

- **React 18** (via CDN)
- **Three.js 0.150** (3D graphics)
- **Babel Standalone** (JSX transformation in browser)
- **No build process** (runs directly in browser)

## Project Structure

```
├── game-test-harness.html      # Development test harness
├── server.py                    # Local dev server with CORS/MIME types
├── wandering-museum-3d-no-export.jsx  # Game 1: Openness (COMPLETE)
├── museum-standalone.html       # Standalone version of Game 1
└── [4 more games to build]
```

## Game Design Philosophy

Each game measures personality through **behavior**, not questions:

1. **Openness** (✅ COMPLETE): Exploration, curiosity, novelty-seeking
2. **Conscientiousness** (TODO): Planning, organization, delayed gratification
3. **Extraversion** (TODO): Social engagement, energy, stimulation preference
4. **Agreeableness** (TODO): Cooperation, fairness, compassion
5. **Neuroticism** (TODO): Stress response, anxiety, emotional stability

---

## GAME 1: WANDERING MUSEUM (Openness) ✅

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

**Important Fixes:**
- Use `performance.now()` not `Date.now()` for time
- Remove `export default` for browser compatibility
- No `file://` loading - must use HTTP server
- Custom Python server sets correct MIME types for .jsx

### Files
- `wandering-museum-3d-no-export.jsx` - Component source
- `museum-standalone.html` - Standalone embeddable version

---

## Development Workflow

### 1. Local Development

Start the custom Python server:
```bash
python3 server.py
# Server runs on http://localhost:8000
```

### 2. Testing with Harness

Open `game-test-harness.html` in browser:
- Select game from dropdown
- Click "Load Game"
- Play through and test
- Results display on completion

### 3. Create Standalone Version

When game is complete, create standalone HTML:
```bash
# Combine component into single HTML file
# (See museum-standalone.html as template)
```

### 4. Deploy to Webflow

Upload standalone HTML to hosting (GitHub Pages, Netlify, etc.)

Embed in Webflow:
```html
<iframe 
    src="https://your-url.com/game.html" 
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
```

**Required:**
- Accept `onComplete` prop (function)
- Call `onComplete(results)` when game finishes
- Return score between 0.0 and 1.0

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

### Browser Compatibility
```javascript
// Remove exports for browser use
// REMOVE: export default Component;
// REMOVE: import React from 'react';

// Instead rely on CDN globals
const { useState, useEffect } = React;
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

### Game 2: The Builder (Conscientiousness)
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

### Game 3: The Gathering (Extraversion)
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

### Game 4: The Dilemma (Agreeableness)
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

### Game 5: The Uncertain Path (Neuroticism)
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

## Troubleshooting

### Port Already in Use
```bash
# Kill process on port 8000
lsof -ti:8000 | xargs kill -9

# Or use different port in server.py
PORT = 8001
```

### MIME Type Errors
```
Error: Disallowed MIME type "application/octet-stream"
```
**Solution:** Use the custom `server.py` which sets correct MIME types for .jsx files

### Export Errors
```
Error: exports is not defined
```
**Solution:** Remove `export default` from .jsx files (use -no-export versions)

### CORS Errors
```
Error: CORS request not http
```
**Solution:** Must use HTTP server, cannot use `file://` protocol

### Shader Shows Gray
**Common causes:**
1. Time value too large (use `performance.now()` not `Date.now()`)
2. Intensity not ramping up (check shader is being applied)
3. UV mapping issue (test with simple `vec3(uv.x, uv.y, 0.5)`)

---

## Resources

### CDN Links Used
```html
<!-- React -->
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

<!-- Three.js -->
<script src="https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.min.js"></script>

<!-- Babel (for JSX transformation) -->
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
```

### Useful Three.js Patterns
- Raycasting: Detect clicks on 3D objects
- Billboard sprites: Objects always face camera
- Post-processing: Full-screen shader effects
- Collision: AABB for simple box collisions
- Input: Keyboard, mouse, touch, gamepad all supported

---

## Project Status

- [x] Game 1: Wandering Museum (Openness)
- [ ] Game 2: The Builder (Conscientiousness)
- [ ] Game 3: The Gathering (Extraversion)
- [ ] Game 4: The Dilemma (Agreeableness)
- [ ] Game 5: The Uncertain Path (Neuroticism)
- [ ] Integration: Combined assessment flow
- [ ] Results: Similarity scoring vs. artist benchmark

---

## Quick Start for New Game

1. Copy `wandering-museum-3d-no-export.jsx` as template
2. Modify game mechanics for your trait
3. Update scoring algorithm
4. Test with `game-test-harness.html`
5. Create standalone HTML when complete
6. Deploy and embed in Webflow

---

## Contact / Notes

This is an experimental art project measuring personality through interactive gameplay.

**Key Insight:** Wandering Museum showed that complex 3D environments work well, but simpler mechanics might be better for remaining games to avoid fatigue.

**Learned:** 
- Orthographic camera creates unique "all visible at once" effect
- Shader effects must be carefully tuned (time units, intensity)
- Multi-platform input is essential (desktop, mobile, gamepad)
- Flying controls feel more "trippy" than walking on ground

Good luck building the remaining games! 🎮✨
