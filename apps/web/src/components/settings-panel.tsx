"use client";

import React, { useState, useEffect } from "react";
import { useWorkspace } from "@/lib/mock-context";
import { 
  Save, Cpu, Layers, Sliders, Check, SlidersHorizontal, 
  Settings2, Activity
} from "lucide-react";

export function SettingsPanel() {
  const {
    currentWorkspace,
    updateSystemPrompt,
  } = useWorkspace();

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
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="border-b border-zinc-200/80 px-4 py-3">
        <h3 className="text-sm font-bold text-zinc-900">工作区配置配置</h3>
        <span className="text-[10px] text-zinc-400 font-medium">
          自定义 AI 的回答角色风格、检索分块和向量提取模型
        </span>
      </div>

      {/* Settings Form Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* System Prompt config */}
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-zinc-400" />
                系统提示词 (System Prompt)
              </label>
              {isSaved && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 animate-in fade-in duration-200">
                  <Check className="h-3 w-3" />
                  已保存
                </span>
              )}
            </div>
            
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              placeholder="编写指示来定义 AI 的回复性格和风格..."
              className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50/30 px-3 py-2.5 text-xs outline-none focus:border-zinc-400 focus:bg-white transition leading-5 resize-none"
            />
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-zinc-800 active:scale-98"
          >
            <Save className="h-3.5 w-3.5" />
            保存系统提示词
          </button>
        </form>

        <div className="h-px bg-zinc-100" />

        {/* Model and parameters settings */}
        <div className="space-y-4">
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-zinc-400" />
            向量化模型适配器 (Embedding Adapter)
          </h4>

          <div className="grid gap-3.5 text-xs">
            <div>
              <label className="block text-[10px] font-semibold text-zinc-500">模型提供商</label>
              <select
                value={modelType}
                onChange={handleModelChange}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-2 outline-none focus:border-zinc-400 focus:bg-white transition"
              >
                <option value="openai">OpenAI (SaaS 托管)</option>
                <option value="ollama">Ollama (本地运行运行时)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-zinc-500">向量提取模型</label>
              <div className="mt-1.5 rounded-xl border border-zinc-150 bg-zinc-50/50 p-2.5 font-mono text-[10px] text-zinc-600">
                {embeddingModel}
              </div>
            </div>
          </div>
        </div>

        <div className="h-px bg-zinc-100" />

        {/* Retrieval hyperparameters */}
        <div className="space-y-4">
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5 text-zinc-400" />
            向量检索超参数 (RAG Hyperparameters)
          </h4>

          <div className="space-y-4 text-xs">
            <div>
              <div className="flex justify-between text-[10px] font-semibold text-zinc-500">
                <span>检索召回段数 (Top-k Chunks)</span>
                <span className="font-bold text-zinc-900">{topK} 个段落</span>
              </div>
              <input
                type="range"
                min="2"
                max="8"
                step="1"
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="mt-2 w-full accent-zinc-900"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-semibold text-zinc-500">
                <span>单分段最大字符数 (Chunk Size)</span>
                <span className="font-bold text-zinc-900">{chunkSize} tokens</span>
              </div>
              <input
                type="range"
                min="200"
                max="1000"
                step="50"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="mt-2 w-full accent-zinc-900"
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-zinc-100" />

        {/* System metrics overview */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/30 p-3.5">
          <h5 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-zinc-400" />
            健康状态检查 (Health Checks)
          </h5>
          <dl className="mt-2.5 grid grid-cols-2 gap-2 text-[10px] text-zinc-500 font-medium">
            <div>
              <dt>向量数据库</dt>
              <dd className="text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                <Check className="h-3 w-3 shrink-0" />
                pgvector (Connected)
              </dd>
            </div>
            <div>
              <dt>对象存储</dt>
              <dd className="text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                <Check className="h-3 w-3 shrink-0" />
                MinIO (Connected)
              </dd>
            </div>
          </dl>
        </div>

      </div>
    </div>
  );
}
