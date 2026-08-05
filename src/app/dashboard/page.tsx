"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wand2, ScanSearch, LayoutTemplate, Plus, FolderKanban } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/components/project/project-card";
import { EmptyState } from "@/components/project/empty-state";
import { useProjectStore } from "@/store/project-store";
import { listGenerations } from "@/core/storage/repository";
import { toast } from "@/components/ui/toaster";

const QUICK = [
  {
    href: "/generator",
    icon: Wand2,
    title: "Фото товара",
    desc: "Новый фон, свет и подача — по описанию или из снимка",
  },
  {
    href: "/analysis",
    icon: ScanSearch,
    title: "Анализ и улучшение",
    desc: "Аудит карточки + улучшение ИИ",
  },
  {
    href: "/infographics",
    icon: LayoutTemplate,
    title: "Инфографика",
    desc: "Готовая карточка с русским текстом и плашками",
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const { projects, loaded, loadProjects, createProject, removeProject } = useProjectStore();
  const [covers, setCovers] = React.useState<Record<string, { cover?: string; count: number }>>({});

  React.useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  React.useEffect(() => {
    (async () => {
      const map: Record<string, { cover?: string; count: number }> = {};
      for (const p of projects) {
        // eslint-disable-next-line no-await-in-loop
        const gens = await listGenerations(p.id);
        map[p.id] = {
          cover: gens[0]?.images[0]?.dataUrl ?? p.uploads[0]?.dataUrl,
          count: gens.length,
        };
      }
      setCovers(map);
    })();
  }, [projects]);

  const handleCreate = async () => {
    const project = await createProject("Новый проект");
    router.push(`/projects/${project.id}`);
  };

  const handleDelete = async (id: string) => {
    await removeProject(id);
    toast.success("Проект удалён");
  };

  return (
    <AppShell title="Дашборд">
      <div className="space-y-8">
        {/* Quick actions */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Быстрые действия</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK.map((q) => (
              <Link key={q.href} href={q.href}>
                <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
                  <CardContent className="flex flex-col gap-3 p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <q.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium leading-tight">{q.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{q.desc}</div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* Projects */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Мои проекты</h2>
            <Button onClick={handleCreate} size="sm" variant="gradient">
              <Plus className="h-4 w-4" />
              Новый проект
            </Button>
          </div>

          {!loaded ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-6 w-6" />}
              title="Пока нет проектов"
              description="Создайте первый проект, чтобы загрузить товар и сгенерировать карточки."
              action={
                <Button onClick={handleCreate} variant="gradient">
                  <Plus className="h-4 w-4" />
                  Создать проект
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  cover={covers[p.id]?.cover}
                  count={covers[p.id]?.count}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
