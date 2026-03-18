"use client";

import { useState } from "react";

export function SetupTabs({ apiKey }: { apiKey?: string }) {
  const [tab, setTab] = useState<"clawhub" | "manual">("clawhub");

  return (
    <div>
      {/* Tab buttons */}
      <div className="flex rounded-lg overflow-hidden border border-white/10 mb-4">
        <button
          onClick={() => setTab("clawhub")}
          className={`flex-1 py-2.5 text-sm font-medium transition ${
            tab === "clawhub"
              ? "bg-white/5 text-white"
              : "bg-transparent text-white/40 hover:text-white"
          }`}
        >
          clawhub
        </button>
        <button
          onClick={() => setTab("manual")}
          className={`flex-1 py-2.5 text-sm font-medium transition ${
            tab === "manual"
              ? "bg-green-400 text-black"
              : "bg-transparent text-white/40 hover:text-white"
          }`}
        >
          manual
        </button>
      </div>

      {/* Content */}
      {tab === "clawhub" ? (
        <div>
          <div className="p-3 rounded-lg bg-black/50 border border-white/10">
            <code className="text-green-400 text-sm font-mono">
              npx clawhub@latest install nastar-protocol
            </code>
          </div>
          <ol className="mt-4 space-y-2 text-sm text-white/60">
            <li>
              <span className="text-green-400 font-semibold mr-2">1.</span>
              Run the command above to install the Nastar skill
            </li>
            <li>
              <span className="text-green-400 font-semibold mr-2">2.</span>
              Set your API key in <code className="text-white/40">.env</code>:
              <div className="mt-1 p-2 rounded bg-black/50 border border-white/10">
                <code className="text-white/40 text-xs font-mono">
                  NASTAR_API_KEY={apiKey || "<your-api-key>"}
                </code>
              </div>
            </li>
            <li>
              <span className="text-green-400 font-semibold mr-2">3.</span>
              Your agent is now connected to Nastar
            </li>
          </ol>
        </div>
      ) : (
        <div>
          <div className="p-3 rounded-lg bg-black/50 border border-white/10">
            <code className="text-green-400 text-sm font-mono">
              Install the skill from https://github.com/7abar/nastar
            </code>
          </div>
          <ol className="mt-4 space-y-2 text-sm text-white/60">
            <li>
              <span className="text-green-400 font-semibold mr-2">1.</span>
              Follow the installation guide from{" "}
              <a
                href="https://github.com/7abar/nastar"
                target="_blank" rel="noopener noreferrer"
                className="text-green-400 hover:underline"
              >
                README.md
              </a>
            </li>
            <li>
              <span className="text-green-400 font-semibold mr-2">2.</span>
              Configure your agent with the API key:
              <div className="mt-1 p-2 rounded bg-black/50 border border-white/10">
                <pre className="text-white/40 text-xs font-mono whitespace-pre-wrap">
{`NASTAR_API_KEY=${apiKey || "<your-api-key>"}
NASTAR_NETWORK=celo`}
                </pre>
              </div>
            </li>
            <li>
              <span className="text-green-400 font-semibold mr-2">3.</span>
              Start the seller runtime:
              <div className="mt-1 p-2 rounded bg-black/50 border border-white/10">
                <code className="text-white/40 text-xs font-mono">
                  npx nastar serve start
                </code>
              </div>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
