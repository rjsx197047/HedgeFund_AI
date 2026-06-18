const CLOUD = ['OpenAI', 'Anthropic', 'Google Gemini', 'xAI Grok', 'MiniMax', 'OpenRouter'];
const LOCAL = ['Ollama', 'LM Studio', 'llama.cpp'];

export function Providers() {
  return (
    <section id="providers">
      <div className="container">
        <div className="split rev">
          <div className="split-media reveal">
            <img
              src="/shots/settings.png"
              alt="The Settings page listing supported large language model providers, with OAuth and API-key options and local runtime auto-detection."
              loading="lazy"
              width={1280}
              height={800}
            />
          </div>
          <div className="reveal">
            <span className="eyebrow">Bring your own model</span>
            <h2>Your keys, your models, your bill</h2>
            <p>
              HedgeFund AI never resells inference. Connect the providers you already
              pay for, or run the whole debate offline on a local model. Keys are
              encrypted by your operating system keychain before they ever touch disk.
            </p>

            <p className="mono" style={{ color: 'var(--faint)', fontSize: '0.78rem', marginTop: 26, marginBottom: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Cloud providers
            </p>
            <div className="chips" style={{ justifyContent: 'flex-start' }}>
              {CLOUD.map((p) => (
                <span className="chip" key={p}>
                  <span className="dot" />
                  {p}
                </span>
              ))}
            </div>

            <p className="mono" style={{ color: 'var(--faint)', fontSize: '0.78rem', marginTop: 22, marginBottom: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Local runtimes (auto-detected, fully offline)
            </p>
            <div className="chips" style={{ justifyContent: 'flex-start' }}>
              {LOCAL.map((p) => (
                <span className="chip local" key={p}>
                  <span className="dot" />
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
