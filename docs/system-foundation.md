# System foundation

## Decision

The application uses a tested Python service for quantum-code operations and a React interface for coordinated interaction. Scientific state crosses the boundary as explicit, versioned JSON. The frontend never infers scientific correctness from visual state.

## Interaction structure

The user journey has five stable stages:

1. Configure - choose the qLDPC code and error settings.
2. Inject - choose errors by hand or generate them from a saved seed.
3. Observe - see which checks detect the errors and why.
4. Decode - apply a correction and check whether it succeeds.
5. Results - repeat the experiment across physical error probabilities and compare logical-error rates.

All five stages are implemented. Configure provides one checked qLDPC HGP code and two error-selection methods. Inject creates and saves the Pauli-error vector. Observe calculates both syndrome components and connects every result to the check support and relevant error qubits. Decode selects a correction, calculates the residual, and checks whether the residual preserves the encoded information. Results runs repeated trials, shows progress, and presents logical-error-rate estimates with their uncertainty and reproducible failure examples.

## HCI principles applied

- **Visibility of system status:** backend connection and capability readiness are named explicitly.
- **Progressive disclosure:** only the current milestone and the next meaningful action are prominent.
- **Recognition over recall:** stages retain short descriptions and consistent numbering.
- **Error prevention:** actions become available only after their required inputs are saved.
- **Consistency:** a single workflow model supplies stage names and descriptions.
- **Accessibility:** semantic landmarks, strong focus treatment, non-color status labels, reduced-motion support, and responsive reading widths are baseline requirements.
- **Honest model boundaries:** the interface states what is not yet simulated and will continue to disclose noise and measurement assumptions.

## API boundary

`GET /api/system/status` provides:

- service identity and API version;
- overall readiness;
- individually named capabilities;
- current scientific-model boundaries.

## Configure contract

The code registry reconstructs the HGP matrices from the length-3 repetition parity check. It calculates GF(2) ranks, CSS orthogonality, row and column weights, `k`, and exact X/Z distance. The API exposes this evidence through `GET /api/codes` and `GET /api/codes/{id}`. The frontend does not hard-code scientific validation claims.

## Inject contract

`POST /api/injections` accepts the confirmed code identifier and either one-based manual Pauli assignments or the configured probability and seed. It returns the 13-qubit Pauli pattern, binary X/Z components, error weight, Pauli counts, and reproducibility metadata. Seeded generation uses the versioned `splitmix64-v1` generator so the same inputs recreate the same pattern.

The frontend keeps qubit numbers visible, supports keyboard operation, summarizes affected qubits without relying on color, and asks users to save their selection before continuing.

## Observe contract

`POST /api/observations` accepts the saved code version and Pauli-error vector. X-type check results are calculated as `H_X e_Z^T`, and Z-type check results are calculated as `H_Z e_X^T`. A Y error contributes to both components. The response includes each syndrome bit, each check's qubit support, and the relevant error qubits so the interface can explain the result without redoing the calculation.

## Decode contract

`POST /api/decoders` recomputes the syndrome from the saved Pauli error. It independently selects minimum-weight X and Z correction components through exact search, with deterministic tie-breaking. The service applies the correction, verifies that both residual syndrome components are zero, and tests residual X and Z components against their stabilizer row spaces. A zero or stabilizer residual is a logical success; a commuting residual outside the stabilizer is reported as a logical failure.

Exact search is appropriate for the current 13-qubit learning code and provides a reference result for validation. It is not presented as a scalable decoder for larger qLDPC codes.

## Batch experiment contract

`POST /api/experiments` creates a background experiment for an ordered list of physical error probabilities. Each point uses the same number of independent code-capacity trials. A versioned batch-seed derivation produces a separate saved seed for every trial, and the existing `splitmix64-v1` generator creates the Pauli error. The selected decoder is accessed through a common decoder registry, so future BP+OSD and BP+LSD implementations can use the same experiment path.

`GET /api/experiments/{id}` reports progress and returns stored results. `POST /api/experiments/{id}/cancel` stops at a trial boundary and preserves completed partial results. Results include logical successes and failures, exact-match and stabilizer-equivalent successes, physical and correction weights, decoder timing, and a limited number of reproducible failure samples.

Logical-error rate is treated as a binomial proportion. Every probability point reports a two-sided Wilson score interval, including points with zero observed failures. This avoids presenting a zero-width uncertainty range when a finite run observes no failures.

## Research basis

- Roffe et al., [Decoding Across the Quantum LDPC Code Landscape](https://arxiv.org/abs/2005.07016), motivates repeatable Monte Carlo evaluation across physical error rates and a decoder-independent path toward BP+OSD for HGP codes.
- The [NIST/SEMATECH guidance for binomial confidence intervals](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm) motivates the Wilson interval used for logical-error-rate uncertainty.
