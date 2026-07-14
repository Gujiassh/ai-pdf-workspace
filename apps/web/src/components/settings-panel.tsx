"use client";

import { useState } from "react";
import { Check, Cpu, Save, Settings2, Sliders } from "lucide-react";

import { translations, useTranslation } from "@/lib/i18n-context";
import { Workspace, useWorkspace } from "@/lib/workspace-context";

type SettingsFormProps = {
  currentWorkspace: Workspace;
  onSavePrompt: (workspaceId: string, prompt: string) => void;
  t: (key: keyof typeof translations.zh) => string;
};

function SettingsForm({ currentWorkspace, onSavePrompt, t }: SettingsFormProps) {
  const [prompt, setPrompt] = useState(currentWorkspace.systemPrompt);
  const [isSaved, setIsSaved] = useState(false);
  const [modelType, setModelType] = useState("openai");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-3-small");
  const [topK, setTopK] = useState(4);
  const [chunkSize, setChunkSize] = useState(500);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSavePrompt(currentWorkspace.id, prompt);
    setIsSaved(true);
    window.setTimeout(() => setIsSaved(false), 2000);
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setModelType(val);
    setEmbeddingModel(
      val === "openai" ? "text-embedding-3-small" : "qwen3-embedding:0.6b (Ollama)",
    );
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-950 transition-colors duration-200">
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 transition">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{t("settings.header")}</h3>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold block mt-0.5">
          {t("settings.subtitle")}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-zinc-400" />
                {t("settings.promptLabel")}
              </label>
              {isSaved ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 animate-in fade-in duration-200">
                  <Check className="h-3 w-3" />
                  {t("settings.saved")}
                </span>
              ) : null}
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              placeholder={t("settings.promptPlaceholder")}
              className="mt-2 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-950 px-3 py-2.5 text-xs outline-none text-zinc-800 dark:text-zinc-200 focus:border-zinc-400 dark:focus:border-zinc-700 focus:bg-white dark:focus:bg-zinc-950 transition leading-5 resize-none"
            />
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 dark:bg-white px-4 py-2.5 text-xs font-bold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition active:scale-98 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            {t("settings.saveBtn")}
          </button>
        </form>

        <div className="h-px bg-zinc-100 dark:bg-zinc-800" />

        <div className="space-y-4">
          <h4 className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-zinc-400" />
            {t("settings.providerLabel")}
          </h4>

          <div className="grid gap-3.5 text-xs">
            <div>
              <label className="block text-[10px] font-semibold text-zinc-500">{t("settings.providerOption")}</label>
              <select
                value={modelType}
                onChange={handleModelChange}
                className="mt-1.5 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 px-2.5 py-2 text-xs outline-none text-zinc-800 dark:text-zinc-200 focus:border-zinc-400 focus:bg-white dark:focus:bg-zinc-950 transition"
              >
                <option value="openai">OpenAI (SaaS 托管)</option>
                <option value="ollama">Ollama (本地运行运行时)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-zinc-500">{t("settings.providerModel")}</label>
              <div className="mt-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 px-2.5 py-2 font-mono text-[9px] text-zinc-500 dark:text-zinc-400">
                {embeddingModel}
              </div>
            </div>
          </div>
        </div>

        <div className="h-px bg-zinc-100 dark:bg-zinc-800" />

        <div className="space-y-4">
          <h4 className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5 text-zinc-400" />
            {t("settings.hyperParams")}
          </h4>

          <div className="space-y-4 text-xs">
            <div>
              <div className="flex justify-between text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                <span>{t("settings.topKLabel")}</span>
                <span className="font-bold text-zinc-900 dark:text-white">{topK} chunks</span>
              </div>
              <input
                type="range"
                min="2"
                max="8"
                step="1"
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="mt-2 w-full accent-zinc-900 dark:accent-white"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                <span>{t("settings.chunkSizeLabel")}</span>
                <span className="font-bold text-zinc-900 dark:text-white">{chunkSize} tokens</span>
              </div>
              <input
                type="range"
                min="200"
                max="1000"
                step="50"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="mt-2 w-full accent-zinc-900 dark:accent-white"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export function SettingsPanel() {
  const { currentWorkspace, updateSystemPrompt } = useWorkspace();
  const { t } = useTranslation();

  if (!currentWorkspace) {
    return null;
  }

  return (
    <SettingsForm
      key={currentWorkspace.id}
      currentWorkspace={currentWorkspace}
      onSavePrompt={updateSystemPrompt}
      t={t}
    />
  );
}
