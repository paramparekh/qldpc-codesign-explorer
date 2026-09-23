import type { CodeDetail } from "../api/codes";

function formatRate(rate: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rate);
}

export function CodeEvidence({ code }: { code: CodeDetail }) {
  const parameters = [
    { label: "Physical qubits", value: code.parameters.n, notation: "n" },
    { label: "Logical qubits", value: code.parameters.k, notation: "k" },
    { label: "Exact distance", value: code.parameters.d, notation: "d" },
    { label: "Encoding rate", value: formatRate(code.parameters.rate), notation: "k/n" },
  ];

  return (
    <section className="panel code-panel" aria-labelledby="code-heading">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">qLDPC code</p>
          <h2 id="code-heading">Verified teaching fixture</h2>
        </div>
        <span className="status-badge status-ready">Selected</span>
      </div>

      <div className="code-identity">
        <div>
          <div className="tag-row" aria-label="Code classification">
            <span>Quantum LDPC</span>
            <span>Hypergraph product</span>
            <span>Fixture v{code.version}</span>
          </div>
          <h3>{code.name}</h3>
          <p>{code.description}</p>
        </div>
        <div className="code-notation" aria-label="Code parameters">
          [[{code.parameters.n}, {code.parameters.k}, {code.parameters.d}]]
        </div>
      </div>

      <dl className="parameter-grid">
        {parameters.map((parameter) => (
          <div key={parameter.label}>
            <dt>{parameter.label}</dt>
            <dd>{parameter.value}</dd>
            <span aria-hidden="true">{parameter.notation}</span>
          </div>
        ))}
      </dl>

      <div className="evidence-section">
        <div className="subheading-row">
          <div>
            <h3>Validation evidence</h3>
            <p>Calculated by the backend from the fixture matrices.</p>
          </div>
          <span className="evidence-count">{code.validation.length}/{code.validation.length} passed</span>
        </div>
        <ul className="validation-list">
          {code.validation.map((item) => (
            <li key={item.id}>
            <span className="check-icon" aria-hidden="true">OK</span>
              <div>
                <div className="validation-title-row">
                  <h4>{item.label}</h4>
                  <span>{item.status}</span>
                </div>
                <p>{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <details className="technical-details">
        <summary>Matrix and construction details</summary>
        <div className="technical-grid">
          <dl>
            <div><dt>H<sub>X</sub> shape</dt><dd>{code.matrix_metadata.h_x_shape.join(" x ")}</dd></div>
            <div><dt>H<sub>Z</sub> shape</dt><dd>{code.matrix_metadata.h_z_shape.join(" x ")}</dd></div>
            <div><dt>Ranks</dt><dd>{code.matrix_metadata.rank_x} / {code.matrix_metadata.rank_z}</dd></div>
            <div><dt>Max check weight</dt><dd>{code.matrix_metadata.max_check_weight}</dd></div>
            <div><dt>Max column weight</dt><dd>{code.matrix_metadata.max_column_weight}</dd></div>
            <div><dt>Total qubit degree</dt><dd>&lt;= {code.matrix_metadata.max_total_qubit_degree}</dd></div>
          </dl>
          <div className="convention-copy">
            <h4>Matrix convention</h4>
            <p><strong>H<sub>X</sub>:</strong> {code.matrix_convention.h_x}</p>
            <p><strong>H<sub>Z</sub>:</strong> {code.matrix_convention.h_z}</p>
            <h4>Provenance</h4>
            <p>{code.provenance}</p>
          </div>
        </div>
      </details>
    </section>
  );
}
