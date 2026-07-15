"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { AuthUser } from "@/lib/auth/types";
import { consumeChatStream } from "@/lib/chat/sse";
import {
  createThread as createChatThread,
  deleteThread as deleteChatThread,
  getThreadMessages,
  listThreads,
  startChatStream,
} from "@/lib/chat/client";
import { mergeUiThreads, toUiCitation, toUiThread, toUiThreadWithMessages } from "@/lib/chat/normalize";
import type { ChatThread, Message } from "@/lib/chat/types";
import type { WorkspaceLocale } from "@/lib/workspaces/normalize";
import type { Workspace } from "./workspace-context";
import type { SendMessageOptions } from "./workspace-context";

export function getNextActiveThreadId(
  threads: ChatThread[],
  currentThreadId: string | null,
): string | null {
  return threads.some((thread) => thread.id === currentThreadId)
    ? currentThreadId
    : threads[0]?.id ?? null;
}

export function getMessageParentId(
  thread: ChatThread | undefined,
  editMessageId?: string,
): string | null {
  const editIndex = editMessageId && thread
    ? thread.messages.findIndex((message) => message.id === editMessageId)
    : -1;
  return editIndex >= 0
    ? thread?.messages[editIndex]?.parentMessageId ?? null
    : thread?.messages[thread.messages.length - 1]?.id ?? null;
}

export function replaceUiThread(previous: ChatThread[], thread: ChatThread): ChatThread[] {
  let replaced = false;
  const nextThreads = previous.map((previousThread) => {
    if (previousThread.id !== thread.id || previousThread.workspaceId !== thread.workspaceId) {
      return previousThread;
    }
    replaced = true;
    return thread;
  });
  return replaced ? nextThreads : [...nextThreads, thread];
}

type UseChatOptions = {
  locale: WorkspaceLocale;
  user: AuthUser | null;
  isAuthHydrating: boolean;
  currentWorkspaceId: string;
  currentWorkspaceIdRef: MutableRefObject<string>;
  activeThreadId: string | null;
  activeThreadIdRef: MutableRefObject<string | null>;
  selectionText: string | null;
  setActiveThreadId: (id: string | null) => void;
  updateWorkspace: (workspaceId: string, updater: (workspace: Workspace) => Workspace) => void;
};

export function useChat({
  locale,
  user,
  isAuthHydrating,
  currentWorkspaceId,
  currentWorkspaceIdRef,
  activeThreadId,
  activeThreadIdRef,
  selectionText,
  setActiveThreadId,
  updateWorkspace,
}: UseChatOptions) {
  const [threads, setThreadsState] = useState<ChatThread[]>([]);
  const threadsRef = useRef(threads);

  const setThreads: Dispatch<SetStateAction<ChatThread[]>> = useCallback(
    (update) => {
      setThreadsState((previous) => {
        const nextThreads = typeof update === "function" ? update(previous) : update;
        threadsRef.current = nextThreads;
        return nextThreads;
      });
    },
    [],
  );

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  const fetchThreadWithMessages = useCallback(
    async (workspaceId: string, threadId: string): Promise<ChatThread> => {
      const payload = await getThreadMessages(workspaceId, threadId);
      return toUiThreadWithMessages(
        payload.thread,
        locale === "en" ? "New Chat" : "新会话",
        payload.messages,
      );
    },
    [locale],
  );

  const replaceThread = useCallback(
    (thread: ChatThread) => {
      setThreads((previous) => replaceUiThread(previous, thread));
    },
    [setThreads],
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrateThreads() {
      if (isAuthHydrating) {
        return;
      }
      if (!user) {
        setThreads([]);
        setActiveThreadId(null);
        return;
      }
      if (!currentWorkspaceId) {
        return;
      }

      const workspaceId = currentWorkspaceId;
      try {
        const payload = await listThreads(workspaceId);
        if (cancelled) {
          return;
        }

        const emptyTitle = locale === "en" ? "New Chat" : "新会话";
        const workspaceThreads = payload.items.map((thread) => toUiThread(thread, emptyTitle));
        setThreads((previous) => mergeUiThreads(previous, workspaceThreads, workspaceId));
        updateWorkspace(workspaceId, (workspace) => ({
          ...workspace,
          threadCount: workspaceThreads.length,
        }));

        const nextActiveThreadId = getNextActiveThreadId(
          workspaceThreads,
          activeThreadIdRef.current,
        );
        setActiveThreadId(nextActiveThreadId);
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setThreads((previous) => previous.filter((thread) => thread.workspaceId !== workspaceId));
          setActiveThreadId(null);
          updateWorkspace(workspaceId, (workspace) => ({
            ...workspace,
            threadCount: 0,
          }));
        }
      }
    }

    void hydrateThreads();

    return () => {
      cancelled = true;
    };
  }, [activeThreadIdRef, currentWorkspaceId, isAuthHydrating, locale, setActiveThreadId, setThreads, updateWorkspace, user]);

  useEffect(() => {
    if (isAuthHydrating || !user || !currentWorkspaceId || !activeThreadId) {
      return;
    }

    let cancelled = false;
    const workspaceId = currentWorkspaceId;
    const threadId = activeThreadId;
    void fetchThreadWithMessages(workspaceId, threadId)
      .then((hydratedThread) => {
        if (!cancelled) {
          replaceThread(hydratedThread);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeThreadId, currentWorkspaceId, fetchThreadWithMessages, isAuthHydrating, replaceThread, user]);

  const switchThread = useCallback(
    (id: string) => {
      const thread = threadsRef.current.find(
        (item) => item.id === id && item.workspaceId === currentWorkspaceIdRef.current,
      );
      if (!thread) {
        return;
      }
      setActiveThreadId(id);
    },
    [currentWorkspaceIdRef, setActiveThreadId],
  );

  const createThread = useCallback(
    async () => {
      const workspaceId = currentWorkspaceId;
      if (!workspaceId) {
        return;
      }

      try {
        const payload = await createChatThread(workspaceId);
        const newThread = toUiThread(
          payload.thread,
          locale === "en" ? "New Chat" : "新会话",
        );
        setThreads((previous) => [
          newThread,
          ...previous.filter((thread) => thread.id !== newThread.id),
        ]);
        setActiveThreadId(newThread.id);
        updateWorkspace(workspaceId, (workspace) => ({
          ...workspace,
          threadCount: workspace.threadCount + 1,
        }));
      } catch (error) {
        console.error(error);
      }
    }, [currentWorkspaceId, locale, setActiveThreadId, setThreads, updateWorkspace]);

  const deleteThread = useCallback(
    async (id: string) => {
      const workspaceId = currentWorkspaceIdRef.current;
      const thread = threadsRef.current.find((item) => item.id === id && item.workspaceId === workspaceId);
      if (!workspaceId || !thread) {
        return;
      }

      try {
        await deleteChatThread(workspaceId, id);
      } catch (error) {
        console.error(error);
        return;
      }

      const nextThreads = threadsRef.current.filter((item) => item.id !== id);
      setThreads(nextThreads);
      if (activeThreadIdRef.current === id) {
        setActiveThreadId(nextThreads.find((item) => item.workspaceId === workspaceId)?.id ?? null);
      }
      updateWorkspace(workspaceId, (workspace) => ({
        ...workspace,
        threadCount: Math.max(0, workspace.threadCount - 1),
      }));
    }, [activeThreadIdRef, currentWorkspaceIdRef, setActiveThreadId, setThreads, updateWorkspace]);

  const sendMessage = useCallback(
    async (content: string, options: SendMessageOptions = {}) => {
      const question = content.trim();
      const workspaceId = currentWorkspaceId;
      const threadId = activeThreadId ?? threadsRef.current.find((thread) => thread.workspaceId === workspaceId)?.id ?? null;
      if (!workspaceId || !threadId || !question) {
        return;
      }

      const currentThread = threadsRef.current.find((thread) => thread.id === threadId);
      const editIndex = options.editMessageId && currentThread
        ? currentThread.messages.findIndex((message) => message.id === options.editMessageId)
        : -1;
      const parentMessageId = getMessageParentId(currentThread, options.editMessageId);

      const now = new Date().toISOString();
      const temporaryUserMessageId = `pending-user-${Date.now()}`;
      const temporaryAssistantMessageId = `pending-assistant-${Date.now()}`;
      const userMessage: Message = {
        id: temporaryUserMessageId,
        role: "user",
        content: question,
        createdAt: now,
        parentMessageId,
        status: "completed",
      };
      const assistantMessage: Message = {
        id: temporaryAssistantMessageId,
        role: "assistant",
        content: "",
        citations: [],
        createdAt: now,
        parentMessageId: temporaryUserMessageId,
        status: "streaming",
      };

      setThreads((previous) => previous.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              title: thread.messages.length === 0 ? question.slice(0, 80) : thread.title,
              messages: [
                ...(editIndex >= 0 ? thread.messages.slice(0, editIndex) : thread.messages),
                userMessage,
                assistantMessage,
              ],
            }
          : thread,
      ));

      let userMessageId = temporaryUserMessageId;
      let assistantMessageId = temporaryAssistantMessageId;
      let streamCompleted = false;

      const updateThreadMessages = (update: (message: Message) => Message) => {
        setThreads((previous) => previous.map((thread) =>
          thread.id === threadId
            ? { ...thread, messages: thread.messages.map(update) }
            : thread,
        ));
      };

      const replaceMessageId = (from: string, to: string) => {
        updateThreadMessages((message) => ({
          ...message,
          ...(message.id === from ? { id: to } : {}),
          ...(message.parentMessageId === from ? { parentMessageId: to } : {}),
        }));
      };

      try {
        const response = await startChatStream(workspaceId, {
          threadId,
          question,
          parentMessageId,
          ...(options.editMessageId ? { editMessageId: options.editMessageId } : {}),
          ...(selectionText?.trim() ? { selectionText: selectionText.trim() } : {}),
        });

        await consumeChatStream(response, {
          onMeta: (payload) => {
            userMessageId = payload.userMessageId;
            assistantMessageId = payload.assistantMessageId;
            replaceMessageId(temporaryUserMessageId, userMessageId);
            replaceMessageId(temporaryAssistantMessageId, assistantMessageId);
          },
          onDelta: (payload) => {
            updateThreadMessages((message) => message.id === assistantMessageId
              ? { ...message, content: `${message.content}${payload.text}` }
              : message,
            );
          },
          onCitations: (payload) => {
            const citations = payload.items.map(toUiCitation);
            updateThreadMessages((message) => message.id === assistantMessageId
              ? { ...message, citations }
              : message,
            );
          },
          onDone: (payload) => {
            streamCompleted = payload.threadId === threadId;
            assistantMessageId = payload.assistantMessageId;
            replaceMessageId(temporaryAssistantMessageId, assistantMessageId);
          },
          onError: (payload) => {
            updateThreadMessages((message) => message.id === assistantMessageId
              ? { ...message, content: payload.message, status: "failed" }
              : message,
            );
          },
        });

        if (!streamCompleted) {
          throw new Error("Chat stream ended before completion.");
        }

        const hydratedThread = await fetchThreadWithMessages(workspaceId, threadId);
        replaceThread(hydratedThread);
      } catch (error) {
        console.error(error);
        try {
          const hydratedThread = await fetchThreadWithMessages(workspaceId, threadId);
          replaceThread(hydratedThread);
        } catch {
          const message = error instanceof Error ? error.message : "Chat request failed.";
          setThreads((previous) => previous.map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  messages: thread.messages
                    .filter((item) => ![temporaryUserMessageId, temporaryAssistantMessageId, userMessageId, assistantMessageId].includes(item.id))
                    .concat({
                      id: temporaryAssistantMessageId,
                      role: "assistant",
                      content: message,
                      citations: [],
                      createdAt: now,
                    }),
                }
              : thread,
          ));
        }
      }
    }, [activeThreadId, currentWorkspaceId, fetchThreadWithMessages, replaceThread, selectionText, setThreads]);

  const removeWorkspace = useCallback(
    (workspaceId: string) => {
      const nextThreads = threadsRef.current.filter((thread) => thread.workspaceId !== workspaceId);
      setThreads(nextThreads);
      const activeThreadWasRemoved = nextThreads.every((thread) => thread.id !== activeThreadIdRef.current);
      if (activeThreadWasRemoved && activeThreadIdRef.current) {
        setActiveThreadId(null);
      }
    },
    [activeThreadIdRef, setActiveThreadId, setThreads],
  );

  const activeThread =
    threads.find((thread) => thread.id === activeThreadId && thread.workspaceId === currentWorkspaceId) ||
    (activeThreadId === null ? threads.find((thread) => thread.workspaceId === currentWorkspaceId) || null : null);

  return {
    threads,
    threadsRef,
    activeThread,
    createThread,
    switchThread,
    deleteThread,
    sendMessage,
    removeWorkspace,
  };
}
