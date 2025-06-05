# Minimal Multiplayer Game

This repository contains a very small multiplayer browser game that can be run in GitHub Codespaces.

## Running in Codespaces

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open the forwarded port in the Codespace to view the game. Share the URL with others to play together.

## Game Play

- Enter a username, choose from several colors (brown, red, green, blue, purple, white, orange) and click **Join Game** to spawn your Goomba.
- Move left and right with the arrow keys; press **space** or the up arrow to jump.
- The camera scrolls with you both horizontally and vertically.
- Left click to place solid blocks.
- Press **R** while pointing the cursor to place a climbable vine block.
- Right click a block to destroy it.
- Middle click also removes a block.
- Press **Q** to shoot a projectile toward the mouse cursor.
- Gravity keeps you on the ground and your position is broadcast to everyone.
- Hold the up arrow while inside a vine block to climb it.
- Players and solid blocks are collidable.
- Standing next to another player for 5 seconds spawns a heart and a tiny Goomba that explodes after 3 seconds.
- Your username appears above your Goomba. If you choose **Fleekshots** as your name your Goomba will wear sunglasses.
