const boundaries = [
  "No quantum code is loaded yet.",
  "No syndrome or decoder output is being simulated.",
  "The first scientific slice will use a verified CSS teaching fixture.",
];

export function ModelBoundary() {
  return (
    <aside className="boundary-card" aria-labelledby="boundary-heading">
      <div className="boundary-icon" aria-hidden="true">i</div>
      <div>
        <h2 id="boundary-heading">Current model boundary</h2>
        <p>
          This release establishes the interaction and service foundation. It does not yet make a
          quantum-error-correction claim.
        </p>
        <ul>
          {boundaries.map((boundary) => (
            <li key={boundary}>{boundary}</li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

