Three.js geometry viewer

This small viewer loads `example_stand.geo.json` and `default.png` from the folder and shows the model with simple UV texturing.

How to run (Windows PowerShell):

1. Open a terminal in this folder (e:\Code\Javaviewer)
2. Start a simple server:

   python -m http.server 8000

3. Open http://localhost:8000 in your browser.

Notes and assumptions:
- This viewer applies the provided `default.png` as a single texture to each box face (simple mapping). The geometry file contains UV atlas coordinates; mapping the atlas precisely per-face is possible but more involved. If you want exact atlas mapping for every face, tell me and I'll implement it.
- Rotations and cube-level pivot are supported when present in the JSON. "Inflate" and "mirror" are mostly ignored for simplicity.
