import { useEffect, useState } from 'react';

type HealthResponse = {
  ok: boolean;
  service: string;
  env: string;
  timestamp: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8787';

function App() {
  const [status, setStatus] = useState<'loading' | 'reachable' | 'unreachable'>('loading');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/health`);

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as HealthResponse;
        setHealth(payload);
        setStatus('reachable');
      } catch (err) {
        setStatus('unreachable');
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    void fetchHealth();
  }, []);

  return (
    <main className="page-shell">
      <section className="card">
        <p className="eyebrow">Overview</p>
        <h1>Product Watcher</h1>

        <div className={`status-row ${status}`}>
          <span className="dot" aria-hidden="true" />
          <span>
            {status === 'loading' && 'Checking API status...'}
            {status === 'reachable' && 'API reachable'}
            {status === 'unreachable' && 'API unreachable'}
          </span>
        </div>

        {health ? (
          <div className="health-info">
            <p>
              <strong>Service:</strong> {health.service}
            </p>
            <p>
              <strong>Environment:</strong> {health.env}
            </p>
            <p>
              <strong>Timestamp:</strong> {health.timestamp}
            </p>
          </div>
        ) : null}

        {status === 'unreachable' ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}

export default App;
