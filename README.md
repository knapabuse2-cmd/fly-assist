# Fly / Assist

A digital fruit fly with an articulated body, a running connectome model, and a small experiment in learning when to ask for help.

**[Open the experiment](https://knapabuse2-cmd.github.io/fly-assist/)** | Built by [0xRovek](https://x.com/knapabuse2)

Runs in your browser. Free local advisor, optional bring-your-own-key Grok connection.

## Try it

1. Choose **Sugar** or **Looming shadow**. Watch simulated neural activity change the decoded body response. Drag either scene to orbit; scroll to zoom.
2. Click **Train & compare**. A readout learns left, right and ask action values from rewards.
3. Click **Run trial**. Seed `100042` contains a direction cue; seed `100046` has no direction cue and the trained readout requests help.
4. Compare **No help**, **Always ask** and **Learned readout** with the same seed. **New trial** advances the seed. **Export results** downloads the model, raw evaluation rows and the last trial.

## Connect Grok

1. Get a restricted, low-budget API key from [xAI](https://console.x.ai/).
2. In **Let it ask Grok**, paste the key, choose a request cap (default 5, maximum 20 per tab session), and explicitly allow paid requests.
3. Click **Enable Grok for this tab**. This stores the key in tab memory; it does not make a request.
4. Run seed `100046` with **Learned readout**. When the readout asks, the browser sends the trial's full food state directly to `https://api.x.ai/v1/chat/completions`.
5. Inspect Grok's actual direction, explanation and reported token usage. Disconnect to clear the key.

The key is never sent to our server, included in exports, stored in localStorage/cookies, or embedded in a URL. Reload clears it. There are no analytics or third-party scripts. As with any browser client, use a restricted key on a trusted device; browser extensions may have access to page contents.

The model is pinned to `grok-4.20-0309-non-reasoning`, with strict JSON output and a 120-token output cap. One request at a time, 20-second timeout, no automatic retries. The cap counts **attempts**, including errors, and is not a monetary budget. An aborted request may still be billed by xAI. Use your xAI account's budget controls too.

The actual returned direction determines the trial outcome, even when wrong. Invalid responses and connection errors stop the trial without substituting a local oracle answer. **Train & compare always uses the free local advisor**; live Grok replies are logged separately. Exported results contain both, clearly labeled, without credentials.

## Run locally

Requirements: Node 24; tested with Node 24.12.0 and npm 11.6.2 on Windows. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm start
```

The server binds only to `127.0.0.1:8846`. Keep the server running while using the app. The supplied response bank and experiment report are ready to use. To reproduce them:

```sh
npm run calibrate
npm run experiment
npm test
npm run build
```

The public app is fully static. Neural simulation, readout training, trial selection and export run in the browser. `npm run build` produces `dist`; the included GitHub Actions workflow publishes it on GitHub Pages. The legacy localhost server exposes offline endpoints only and never forwards Grok calls. Set `GITHUB_ACTIONS=true` when building for the `/fly-assist/` project path.

## What is actually simulated

The LIF engine and data come from [Fly Brain Bench](https://github.com/RaphaelSR/fly-brain-bench), pinned at `9031c5ba5d09db1650047050c0295fb12902b227`.

- 138,639 neurons, with measured positions and connectivity from FlyWire v783.
- 2,700,513 retained neuron-to-neuron edges; these are weighted edges, not a count of individual synaptic contacts. The upstream browser dataset keeps edges with at least five contacts.
- Fixed synaptic weights; Poisson input, 0.1 ms integration step; seeded 150 ms response windows for the experiment.
- A procedural fly body with articulated legs, tripod gait, wings and feeding movement, reused from Fly Brain Bench. The body and rate-to-motor mapping are engineered; there is no full muscle/contact physics model here.

In sensory exploration, the browser runs the complete retained LIF graph in a worker. Output rates drive the body via the upstream decoder. Wall-clock animation speed is independent of biological simulation time; the displayed millisecond counter is simulated time.

## The assistance experiment

This is a deliberately small two-choice foraging task. One covered dish contains food. Half of the seeded tasks approximately have a correct direction cue; the others have no cue. The engineered encoder maps left-cue → sugar stimulus, right-cue → touch stimulus, missing-cue → looming stimulus. This does **not** mean that a biological fly interprets those stimuli as instructions.

The policy sees only 58 downstream cell-type firing-rate features. It cannot read the cue label, target, trial seed or food location. A linear readout learns three action values by epsilon-greedy reward learning: left, right, ask. Correct choices earn +1, wrong choices −1, and asking costs 0.35. Synapses in the connectome are never trained.

For an ask action, the **local full-state oracle** returns the correct food arm. It is an intentionally perfect helper, not an LLM. The selected arm drives a waypoint steering controller for the articulated body. The browser re-simulates the selected neural recording using its original seed and plays its spikes at 10× slower speed. The subsequent body movement visualizes the selected action; this stage is not a closed-loop, physics-validated model of natural fly navigation.

## Reproducible result

Training: 6,000 trial seeds `100–6099`, using 36 independently seeded neural recordings. Testing: 256 new trial seeds `100000–100255`, using 24 held-out neural recordings. These 24 recordings are reused across the test trials; they are not 256 independent brain simulations.

| Policy | Food reached | Hints | Mean reward |
| --- | ---: | ---: | ---: |
| No help | 199 / 256 | 0 | 0.555 |
| Always ask | 256 / 256 | 256 | 0.650 |
| Learned readout | 256 / 256 | 122 | 0.833 |
| Shuffled neural features | 158 / 256 | 73 | 0.135 |

The learned readout asks in all 122 unmarked trials and none of the 134 marked trials in this evaluation. It saves 134 hints (52.3%) against always asking. The feature-shuffle control breaks the relationship between the trial and neural recording and worsens performance. This is evidence of the simple engineered decision rule working on held-out noise samples, not biological learning, natural cognition, or validated Grok performance.

Machine-readable evidence: `reports/calibration.json`, `reports/experiment.json`, `public/neural-bank.json`. Tests reproduce held-out neural responses from the graph, check disjoint seeds, compare policies and the shuffled-feature control, and test Grok opt-in, request caps, concurrency, sanitized errors and correct handling of wrong replies using a mock transport. CORS and error handling were also checked in a browser with an invalid placeholder key; the release check made no paid model calls.

## Sources and licensing

- [Fly Brain Bench](https://github.com/RaphaelSR/fly-brain-bench) — Raphael Rocha; MIT license copied to `public/vendor/LICENSE`. `public/vendor/fly.js` adds arena dishes and an arena camera. The LIF simulation code is unchanged; `public/neural.worker.js` adds seeded finite recordings and cancels pending ticks on pause. `public/vendor/data.js` also accepts compressed or host-decompressed assets.
- [FlyWire](https://flywire.ai/) — v783 connectome data, CC BY 4.0; full attribution is in `public/data/ATTRIBUTION.md`.
- [Eon's account of brain–body coupling](https://eon.systems/updates/embodied-brain-emulation) informed the distinction between measured anatomy and engineered motor control. Eon's NeuroMechFly/MuJoCo embodiment is not used here.
- [xAI Grok 4.20 non-reasoning](https://docs.x.ai/developers/models/grok-4.20-non-reasoning) — model reference. Check the current price and your model access before enabling paid requests.

## License

New application code: MIT. Reused Fly Brain Bench code retains its MIT license. The packaged FlyWire data is CC BY 4.0 and has separate attribution above.

For a shareable capture of the actual canvases, open `?demo=1` and click **Record local demo**. The recording uses the local advisor and never calls Grok.
