"use client";

import React, { useState, useEffect } from "react";
import { useWorkspace } from "@/lib/mock-context";
import { useTranslation } from "@/lib/i18n-context";
import { 
  Save, Cpu, Layers, Sliders, Check, SlidersHorizontal, 
  Settings2, Activity
} from "lucide-react";

export function SettingsPanel() {
  const {
    currentWorkspace,
    updateSystemPrompt,
  } = useWorkspace();

  const { t } = useTranslation();

  const [prompt, setPrompt] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [modelType, setModelType] = useState("openai");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-3-small");
  const [topK, setTopK] = useState(4);
  const [chunkSize, setChunkSize] = useState(500);

  useEffect(() => {
    if (currentWorkspace) {
      setPrompt(currentWorkspace.systemPrompt);
    }
  }, [currentWorkspace]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace) return;

    updateSystemPrompt(currentWorkspace.id, prompt);
    setIsSaved(true);

    setTimeout(() => {
      setIsSaved(false);
    }, 2000);
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setModelType(val);
    if (val === "openai") {
      setEmbeddingModel("text-embedding-3-small");
    } else {
      setEmbeddingModel("qwen3-embedding:0.6b (Ollama)");
    }
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-950 transition-colors duration-200">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 transition">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{t("settings.header")}</h3>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold block mt-0.5">
          {t("settings.subtitle")}
        </span>
      </div>

      {/* Settings Form Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* System Prompt config */}
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-zinc-400" />
                {t("settings.promptLabel")}
              </label>
              {isSaved && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 animate-in fade-in duration-200">
                  <Check className="h-3 w-3" />
                  {t("settings.saved")}
                </span>
              )}
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

        <div className="h-px bg-zinc-150 dark:bg-zinc-850" />

        {/* Model adapter */}
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

        <div className="h-px bg-zinc-150 dark:bg-zinc-850" />

        {/* Hyperparameters */}
        <div className="space-y-4">
          <h4 className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5 text-zinc-400" />
            {t("settings.hyperParams")}
          </h4>

          <div className="space-y-4 text-xs">
            <div>
              <div className="flex justify-between text-[10px] font-semibold text-zinc-550 dark:text-zinc-400">
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
              <div className="flex justify-between text-[10px] font-semibold text-zinc-550 dark:text-zinc-400">
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

        <div className="h-px bg-zinc-150 dark:bg-zinc-850" />

        {/* Metrics checks */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-900/10 p-3.5">
          <h5 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-550 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-zinc-400" />
            {t("settings.healthChecks")}
          </h5>
          <dl className="mt-2.5 grid grid-cols-2 gap-2 text-[9px] text-zinc-500 dark:text-zinc-400 font-semibold">
            <div>
              <dt>{t("settings.dbStatus")}</dt>
              <dd className="text-emerald-600 dark:text-emerald-500 font-bold flex items-center gap-1 mt-0.5">
                <Check className="h-3 w-3 shrink-0" />
                {t("settings.connected")}
              </dd>
            </div>
            <div>
              <dt>{t("settings.s3Status")}</dt>
              <dd className="text-emerald-600 dark:text-emerald-500 font-bold flex items-center gap-1 mt-0.5">
                <Check className="h-3 w-3 shrink-0" />
                {t("settings.connected")}
              </dd>
            </div>
          </dl>
        </div>

      </div>
    </div>
  );
}
