# System foundation

## Decision

The application uses a tested Python service for quantum-code operations and a React interface for coordinated interaction. Scientific state crosses the boundary as explicit, versioned JSON. The frontend never infers scientific correctness from visual state.

## Interaction structure

The user journey has four stable stages:

1. Configure - choose a verified code and disclose all model assumptions.
2. Inject - add manual or seeded code-capacity errors.
3. Observe - inspect the resulting syndrome through linked representations.
4. Decode - examine the proposed correction, residual, status, and limitations.

Before Configure is implemented, the application displays a foundation state. This avoids presenting non-functional controls or implying that quantum services already exist.

## HCI principles applied

- **Visibility of system status:** backend connection and capability readiness are named explicitly.
- **Progressive disclosure:** only the current milestone and the next meaningful action are prominent.
- **Recognition over recall:** stages retain short descriptions and consistent numbering.
- **Error prevention:** unavailable stages are represented as future steps, not clickable dead ends.
- **Consistency:** a single workflow model supplies stage names and descriptions.
- **Accessibility:** semantic landmarks, strong focus treatment, non-color status labels, reduced-motion support, and responsive reading widths are baseline requirements.
- **Honest model boundaries:** the interface states what is not yet simulated and will continue to disclose noise and measurement assumptions.

## API boundary

`GET /api/system/status` provides:

- service identity and API version;
- overall readiness;
- individually named capabilities;
- current scientific-model boundaries.

The next slice will add a code registry and a verified teaching fixture without changing the shell's information architecture.

