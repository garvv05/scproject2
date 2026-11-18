# RouteEvolve: Delivery Route Optimizer using a Genetic Algorithm (TSP)

A Soft Computing laboratory project demonstrating how **Genetic Algorithms (GAs)** solve the NP-hard **Travelling Salesman Problem (TSP)** for last-mile delivery logistics across the commercial and industrial hubs of **Ludhiana, Punjab, India**.

The project is built entirely with vanilla web technologies, runs 100% on localhost with zero cloud dependencies or API keys, features an **Offline Canvas Plane Mode**, runs evolution in a dedicated **Web Worker** at 60 FPS, and includes an interactive **Explain Mode** designed for lab demonstrations and viva examinations.

---

## 1. Quick Start (One Command)

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher) **OR** [Python 3](https://python.org/)

### Option A: Node.js (Zero Dependencies)
Run the provided built-in static server:
```bash
node server.js
```
Open your browser and navigate to:
**[http://localhost:5500](http://localhost:5500)**

### Option B: Python 3 Alternative
```bash
python -m http.server 5500
```
Then open: **[http://localhost:5500](http://localhost:5500)**

### Automated Verification Test Suite
Visit the browser test suite directly at:
**[http://localhost:5500/tests.html](http://localhost:5500/tests.html)**

---

## 2. Key Features

- **Cartographer's Dispatch Desk Aesthetic:**
  Warm parchment light palette (`#F4EFE6`), deep maritime ink typography, vermilion route highlights, and a high-contrast dark "Night Map" mode.
- **Dual Visualizer Engines:**
  - **Online Leaflet Map:** Stored locally in `/vendor/leaflet/`, centered on Ludhiana with custom SVG numbered markers, directional arrows, and depot badges.
  - **Offline Canvas Plane:** Built-in HTML5 Canvas grid mode requiring zero internet and zero tile downloads, computing Euclidean plane distances.
- **Interactive Stop Manipulation:**
  - Click on the map or canvas to drop new delivery shops.
  - Drag markers to reposition them with real-time distance updates.
  - Right-click any stop to delete it or set it as the starting depot.
- **Rich Presets for Ludhiana:**
  - **Ludhiana Demo (12 stops):** Clock Tower depot, Bharat Nagar Chowk, PAU, Model Town, Sarabha Nagar, Civil Lines, Fountain Chowk, Aarti Chowk, Chaura Bazar, Railway Station, Mall Road, Dugri.
  - **Ludhiana Large (25 stops):** Extensive route spanning Jamalpur, Focal Point, Samrala Chowk, Gill Road, Salem Tabri, Ayali Chowk, Giaspura, etc.
  - **Random Stops Generator:** Adjustable from 5 to 60 stops.
- **Multithreaded GA Engine (Web Worker):**
  Pure JavaScript engine executing off the main thread; smooth 60 FPS map rendering even with 60 stops and 500 individuals.
- **Native Canvas Convergence Chart:**
  Dual-line real-time plotting of Best Distance vs. Average Distance, with a dashed reference line for the Nearest Neighbour baseline and hover inspection tooltips.
- **Explain Mode (Step-by-Step Viva Walkthrough):**
  Freezes evolution to step through a single generation with real chromosome data:
  1. Evaluate Fitness & identify elites.
  2. Select Parent 1 and Parent 2.
  3. Crossover (Order Crossover / PMX cut points and gene strips).
  4. Mutation (Swap/Inversion highlighted).
  5. Insertion of valid offspring into the new population.
- **Comparative Benchmarking:**
  - Instant baseline comparison against greedy **Nearest Neighbour (NN)**.
  - Optional post-run **2-Opt Polish** local search.
  - Post-run comparison table highlighting the overall winning method.
- **Experimentation & Reproducibility:**
  - **Mulberry32 PRNG:** Seed input enables 100% deterministic, reproducible runs.
  - **Compare Crossovers:** Runs OX vs. PMX side-by-side with identical seeds and overlays both curves.
  - **Run 10 Times:** Evaluates stochastic variance, reporting Best, Worst, Mean, and Standard Deviation.
  - **Exporting:** Download the ordered delivery manifest as CSV, convergence chart as PNG, and stops as JSON.

---

## 3. How the Genetic Algorithm Maps to TSP

The Travelling Salesman Problem requires finding the Hamiltonian cycle of minimal total length through $N$ cities, starting and finishing at a designated dispatch depot.

| GA Concept | TSP Domain Mapping | Implementation in RouteEvolve |
| :--- | :--- | :--- |
| **Gene** | A specific delivery stop (city) | Integer index $0 \le c < N$ |
| **Chromosome** | An entire closed delivery tour | Permutation array of length $N$: `[0, c1, c2, ..., cN-1]` starting at Depot (0) |
| **Population** | A diverse pool of candidate tours | Array of $M$ valid permutation individuals |
| **Fitness Function** | Quality of the delivery route | $f = \frac{1}{\text{Total Distance in km}}$ (shorter distance = higher fitness) |
| **Distance Metric** | Real-world travel distance | Haversine spherical formula on coordinates ($R = 6371\text{ km}$), precomputed into an $N \times N$ matrix |
| **Selection** | Survival of shorter routes | Tournament ($k$), Roulette Wheel, or Linear Rank Selection |
| **Crossover** | Inheriting good sub-tours from two parents | Order Crossover (OX) or Partially Mapped Crossover (PMX) |
| **Mutation** | Minor topological variations to escape local minima | Swap (2-exchange), Inversion (2-Opt subsegment reversal), or Scramble |
| **Elitism** | Preserving the current best route | Direct copying of top $E$ routes into the next generation |

---

## 4. Parameter Guide

- **Population Size ($M$, 20–500):** Number of candidate routes in each generation. Larger populations explore the search space more thoroughly but require more computation per generation. (Recommended: 100).
- **Crossover Rate ($P_c$, 0–100%):** Frequency with which selected parent pairs undergo crossover versus passing through directly. High crossover rates combine good sub-tours rapidly. (Recommended: 85%).
- **Mutation Rate ($P_m$, 0–100%):** Probability of applying a mutation operator to each offspring. Maintains genetic diversity and prevents premature stagnation. (Recommended: 10%–20%).
- **Elitism Count ($E$, 0–15):** Number of best individuals copied directly to the next generation. Guarantees that the best solution found never deteriorates. (Recommended: 2).
- **Tournament Size ($k$, 2–15):** Number of individuals randomly competing in tournament selection. Larger values increase selection pressure toward fitter parents. (Recommended: 5).
- **Stagnation Limit ($K$, 20–400):** Automatic termination condition when the best distance does not improve for $K$ consecutive generations. (Recommended: 150).

---

## 5. Project Architecture & File Structure

```
/routeevolve
  index.html            # Main UI layout, HUD controls, panels, viva modal
  server.js             # Zero-dependency Node.js HTTP server (port 5500)
  tests.html            # Automated unit test suite (11 test cases)
  README.md             # Documentation, viva guide, architecture overview
  /css
    style.css           # Cartographer's dispatch desk theme, animations, dark mode
  /js
    main.js             # Main thread controller, DOM event wiring, UI reactivity
    ga.js               # Pure GA engine, mathematical operators, validity assertions
    worker.js           # Web Worker thread for async evolution & experiments
    baseline.js         # Nearest Neighbour heuristic & 2-Opt local search polish
    geo.js              # Haversine distance, Euclidean distance, N x N distance matrix
    mapView.js          # Leaflet map manager + offline canvas plane renderer
    chart.js            # Native HTML5 Canvas dual-line convergence chart
    presets.js          # Verified coordinates for 28 real Ludhiana landmarks
  /vendor
    /leaflet            # Locally stored leaflet.js, leaflet.css, and marker images
    /fonts              # Locally stored JetBrainsMono.ttf and SourceSerif4.ttf
```

---

## 6. Eight Likely Viva Questions & Answers

### Q1: Why do we use permutation encoding instead of binary encoding for TSP?
**Answer:** In classical GAs, binary encoding works well for knapsack or feature selection problems where each gene is an independent yes/no decision. In TSP, every city must be visited exactly once. If binary or standard value encoding were used, crossover and mutation would constantly generate invalid solutions with duplicate cities and unvisited cities. Permutation encoding guarantees that the chromosome directly represents the ordered visitation sequence.

### Q2: Why does standard single-point crossover fail for TSP, and how does Order Crossover (OX) fix it?
**Answer:** Single-point crossover cuts two parents at point $k$ and swaps their tails. In TSP, the tail from Parent 2 almost always contains cities that were already visited in the head of Parent 1, causing immediate duplication and omissions. **Order Crossover (OX)** preserves the relative order of cities: it copies a contiguous slice from Parent 1 directly into the child, and then fills all remaining positions with the unused cities in the exact cyclic order they appear in Parent 2.

### Q3: What is the purpose of Elitism, and what happens if Elitism is set to 0?
**Answer:** Elitism guarantees that the best $E$ individuals of generation $g$ survive unchanged into generation $g+1$. Without elitism ($E = 0$), stochastic crossover or mutation can destroy the best route discovered so far, causing fitness to fluctuate or degrade. With elitism, the best-so-far distance is strictly monotonically non-increasing.

### Q4: What happens if the mutation rate is set too high or too low?
**Answer:**
- **Too low ($\approx 0\%$):** The population quickly loses genetic diversity and gets permanently trapped in a sub-optimal local minimum (premature convergence).
- **Too high ($\approx 100\%$):** Mutation disrupts beneficial sub-tours faster than selection can preserve them, degenerating the Genetic Algorithm into an inefficient random walk.

### Q5: Why is the Genetic Algorithm not guaranteed to find the absolute global minimum?
**Answer:** Genetic Algorithms are meta-heuristic, stochastic optimization algorithms. They balance **exploration** (searching new regions of the tour space) and **exploitation** (refining known good routes). Because TSP is an NP-hard problem with an astronomical search space ($O(N!)$), the GA searches a tiny fraction of candidate permutations and converges to a near-optimal solution within practical time limits rather than proving optimality.

### Q6: How does the GA compare to Brute Force and Nearest Neighbour?
**Answer:**
- **Brute Force:** Checks all $(N-1)! / 2$ routes. For $N = 25$, this requires $\approx 3.1 \times 10^{23}$ evaluations, taking billions of years.
- **Nearest Neighbour (Greedy):** Very fast ($O(N^2)$), but frequently gets "cornered" into making long backtracking jumps near the end of the tour.
- **Genetic Algorithm:** Polynomial time per generation ($O(M \cdot N)$), exploring multiple trajectories simultaneously and consistently outperforming greedy heuristics on complex topologies.

### Q7: What is the difference between Order Crossover (OX) and Partially Mapped Crossover (PMX)?
**Answer:**
- **OX (Davis, 1985):** Emphasizes preserving the **relative sequence/order** of cities. Elements outside the copied segment are filled in cyclic rotational order from Parent 2.
- **PMX (Goldberg & Lingle, 1985):** Emphasizes preserving **absolute positions**. It builds an explicit mapping table for the cut segment and uses bidirectional lookup chains to swap elements into unoccupied positional slots.

### Q8: Why do we precompute an $N \times N$ Distance Matrix instead of computing distances on the fly?
**Answer:** Evaluating the total distance of a tour of length $N$ requires $N$ distance evaluations. Computing Haversine distances on the fly involves multiple trigonometric calls (`sin`, `cos`, `atan2`), which are computationally expensive. Precomputing the symmetric $N \times N$ matrix once ($O(N^2)$) reduces all subsequent fitness evaluations to $O(N)$ high-speed array lookups, enabling the Web Worker to evolve hundreds of generations per second.

---

## 7. License & Academic Attribution
Developed for academic laboratory evaluation in **Soft Computing / Artificial Intelligence**. Free to use, study, and extend for educational purposes.
