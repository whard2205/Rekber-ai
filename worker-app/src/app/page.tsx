"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { rupiah } from "@/lib/format";

interface TaskListing {
  taskId: string;
  spec: { title: string; instructions: string; acceptanceCriteria: string[]; bountyIDRX: number };
  bounty: string;
}

export default function HomePage() {
  const [tasks, setTasks] = useState<TaskListing[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      const data = await res.json();
      if (!cancelled) setTasks(data.tasks);
    }
    load();
    const interval = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (tasks === null) {
    return <div className="empty">Memuat kerjaan...</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="empty">
        <p>Belum ada kerjaan dari AI saat ini.</p>
        <p style={{ fontSize: 13 }}>Halaman ini akan otomatis refresh saat ada tugas baru.</p>
      </div>
    );
  }

  return (
    <>
      {tasks.map((t) => (
        <Link key={t.taskId} href={`/task/${t.taskId}`} style={{ textDecoration: "none" }}>
          <div className="card">
            <p className="card-title">{t.spec.title}</p>
            <p className="card-meta">{t.spec.instructions}</p>
            <span className="bounty">{rupiah(t.bounty)}</span>
          </div>
        </Link>
      ))}
    </>
  );
}
