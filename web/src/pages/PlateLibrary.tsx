import ActivityIndicator from "@/components/indicators/activity-indicator";
import Heading from "@/components/ui/heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { FrigateConfig } from "@/types/frigateConfig";
import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import useSWR from "swr";

type PlateListType = "whitelist" | "blacklist";
type PlateGroups = Record<string, string[]>;

function sanitizeGroupName(value: string) {
  return value.trim();
}

function sanitizePattern(value: string) {
  return value.trim();
}

export default function PlateLibrary() {
  const { data: config, mutate: refreshConfig } = useSWR<FrigateConfig>("config");

  // title
  useEffect(() => {
    document.title = "Библиотека авто (госномера)";
  }, []);

  const [listType, setListType] = useState<PlateListType>("whitelist");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [newGroup, setNewGroup] = useState("");
  const [newPattern, setNewPattern] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const groups: PlateGroups = useMemo(() => {
    const lpr = config?.lpr as unknown as {
      whitelist?: PlateGroups;
      blacklist?: PlateGroups;
    };
    if (!lpr) return {};
    return (listType === "whitelist" ? lpr.whitelist : lpr.blacklist) || {};
  }, [config, listType]);

  const groupNames = useMemo(
    () => Object.keys(groups).sort((a, b) => a.localeCompare(b)),
    [groups],
  );

  useEffect(() => {
    // keep selection valid when switching tabs / refreshing config
    if (!selectedGroup || !groupNames.includes(selectedGroup)) {
      setSelectedGroup(groupNames[0] || "");
    }
  }, [groupNames, selectedGroup]);

  const patterns = useMemo(() => {
    if (!selectedGroup) return [];
    return groups[selectedGroup] || [];
  }, [groups, selectedGroup]);

  const saveGroup = useCallback(
    async (type: PlateListType, groupName: string, nextPatterns: string[] | "") => {
      setIsSaving(true);
      try {
        await axios.put("/config/set", {
          requires_restart: 0,
          config_data: {
            lpr: {
              [type]: {
                [groupName]: nextPatterns,
              },
            },
          },
        });
        await refreshConfig();
      } finally {
        setIsSaving(false);
      }
    },
    [refreshConfig],
  );

  const handleCreateGroup = useCallback(async () => {
    const groupName = sanitizeGroupName(newGroup);
    if (!groupName) return;

    if (groups[groupName]) {
      toast.error("Группа уже существует", { position: "top-center" });
      return;
    }

    try {
      await saveGroup(listType, groupName, []);
      setNewGroup("");
      setSelectedGroup(groupName);
      toast.success("Группа добавлена", { position: "top-center" });
    } catch (err) {
      const error = err as {
        response?: { data?: { message?: string; detail?: string } };
      };
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.detail ||
        "Unknown error";
      toast.error(`Не удалось добавить группу: ${errorMessage}`, {
        position: "top-center",
      });
    }
  }, [groups, listType, newGroup, saveGroup]);

  const handleAddPattern = useCallback(async () => {
    const pattern = sanitizePattern(newPattern);
    if (!selectedGroup || !pattern) return;

    const current = groups[selectedGroup] || [];
    const next = Array.from(new Set([...current, pattern]));

    try {
      await saveGroup(listType, selectedGroup, next);
      setNewPattern("");
      toast.success("Номер/паттерн добавлен", { position: "top-center" });
    } catch (err) {
      const error = err as {
        response?: { data?: { message?: string; detail?: string } };
      };
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.detail ||
        "Unknown error";
      toast.error(`Не удалось добавить: ${errorMessage}`, {
        position: "top-center",
      });
    }
  }, [groups, listType, newPattern, saveGroup, selectedGroup]);

  const handleDeletePattern = useCallback(
    async (pattern: string) => {
      if (!selectedGroup) return;
      const current = groups[selectedGroup] || [];
      const next = current.filter((p) => p !== pattern);
      try {
        await saveGroup(listType, selectedGroup, next);
        toast.success("Удалено", { position: "top-center" });
      } catch (err) {
        const error = err as {
          response?: { data?: { message?: string; detail?: string } };
        };
        const errorMessage =
          error.response?.data?.message ||
          error.response?.data?.detail ||
          "Unknown error";
        toast.error(`Не удалось удалить: ${errorMessage}`, {
          position: "top-center",
        });
      }
    },
    [groups, listType, saveGroup, selectedGroup],
  );

  const handleDeleteGroup = useCallback(async () => {
    if (!selectedGroup) return;
    try {
      await saveGroup(listType, selectedGroup, "");
      toast.success("Группа удалена", { position: "top-center" });
      setSelectedGroup("");
    } catch (err) {
      const error = err as {
        response?: { data?: { message?: string; detail?: string } };
      };
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.detail ||
        "Unknown error";
      toast.error(`Не удалось удалить группу: ${errorMessage}`, {
        position: "top-center",
      });
    }
  }, [listType, saveGroup, selectedGroup]);

  if (!config) {
    return <ActivityIndicator />;
  }

  return (
    <div className="flex size-full flex-col p-2">
      <Toaster position="top-center" closeButton={true} />
      <div className="flex items-center justify-between">
        <Heading as="h3">Библиотека авто (госномера)</Heading>
        <div className="text-sm text-muted-foreground">
          Люди:{" "}
          <Link className="text-primary underline" to="/faces">
            библиотека лиц
          </Link>
        </div>
      </div>

      <Separator className="my-3 flex bg-secondary" />

      <Tabs
        value={listType}
        onValueChange={(v) => setListType(v as PlateListType)}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="whitelist">Белый список</TabsTrigger>
          <TabsTrigger value="blacklist">Чёрный список</TabsTrigger>
        </TabsList>

        <TabsContent value="whitelist" className="mt-4">
          {/* content uses current listType state */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <Heading as="h4">Группы</Heading>

              <div className="space-y-2">
                <Label htmlFor="group">Выбранная группа</Label>
                <div className="flex gap-2">
                  <select
                    id="group"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    disabled={isSaving}
                  >
                    <option value="" disabled>
                      {groupNames.length ? "Выберите группу" : "Групп нет"}
                    </option>
                    {groupNames.map((g) => (
                      <option key={g} value={g}>
                        {g} ({(groups[g] || []).length})
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="destructive"
                    disabled={isSaving || !selectedGroup}
                    onClick={handleDeleteGroup}
                  >
                    Удалить
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newGroup">Новая группа</Label>
                <div className="flex gap-2">
                  <Input
                    id="newGroup"
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                    placeholder="например: staff / banned"
                    disabled={isSaving}
                  />
                  <Button
                    disabled={isSaving || !sanitizeGroupName(newGroup)}
                    onClick={handleCreateGroup}
                  >
                    Добавить
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Группа — это имя набора номеров/паттернов.
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Heading as="h4">Номера / паттерны</Heading>

              <div className="space-y-2">
                <Label htmlFor="newPattern">Добавить номер или regex</Label>
                <div className="flex gap-2">
                  <Input
                    id="newPattern"
                    value={newPattern}
                    onChange={(e) => setNewPattern(e.target.value)}
                    placeholder="A123BC77 или ^A\\d{3}BC77$"
                    disabled={isSaving || !selectedGroup}
                  />
                  <Button
                    disabled={
                      isSaving || !selectedGroup || !sanitizePattern(newPattern)
                    }
                    onClick={handleAddPattern}
                  >
                    Добавить
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Можно хранить как точные значения, так и регулярные выражения.
                </div>
              </div>

              <div className="rounded-md border p-3">
                {selectedGroup ? (
                  patterns.length ? (
                    <ul className="space-y-2">
                      {patterns.map((p) => (
                        <li
                          key={p}
                          className="flex items-center justify-between gap-3"
                        >
                          <code className="break-all rounded bg-muted px-2 py-1 text-sm">
                            {p}
                          </code>
                          <Button
                            variant="ghost"
                            className="text-destructive"
                            disabled={isSaving}
                            onClick={() => handleDeletePattern(p)}
                          >
                            Удалить
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      В группе пока нет записей.
                    </div>
                  )
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Сначала выберите или создайте группу.
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator className="my-6 flex bg-secondary" />
          <div className="text-sm text-muted-foreground">
            Изменения сохраняются в `config.yml` через API `PUT /config/set`.
          </div>
        </TabsContent>
        <TabsContent value="blacklist" className="mt-4">
          {/* render the same UI; state drives which list is edited */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <Heading as="h4">Группы</Heading>

              <div className="space-y-2">
                <Label htmlFor="group">Выбранная группа</Label>
                <div className="flex gap-2">
                  <select
                    id="group"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    disabled={isSaving}
                  >
                    <option value="" disabled>
                      {groupNames.length ? "Выберите группу" : "Групп нет"}
                    </option>
                    {groupNames.map((g) => (
                      <option key={g} value={g}>
                        {g} ({(groups[g] || []).length})
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="destructive"
                    disabled={isSaving || !selectedGroup}
                    onClick={handleDeleteGroup}
                  >
                    Удалить
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newGroup">Новая группа</Label>
                <div className="flex gap-2">
                  <Input
                    id="newGroup"
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                    placeholder="например: staff / banned"
                    disabled={isSaving}
                  />
                  <Button
                    disabled={isSaving || !sanitizeGroupName(newGroup)}
                    onClick={handleCreateGroup}
                  >
                    Добавить
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Группа — это имя набора номеров/паттернов.
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Heading as="h4">Номера / паттерны</Heading>

              <div className="space-y-2">
                <Label htmlFor="newPattern">Добавить номер или regex</Label>
                <div className="flex gap-2">
                  <Input
                    id="newPattern"
                    value={newPattern}
                    onChange={(e) => setNewPattern(e.target.value)}
                    placeholder="A123BC77 или ^A\\d{3}BC77$"
                    disabled={isSaving || !selectedGroup}
                  />
                  <Button
                    disabled={
                      isSaving || !selectedGroup || !sanitizePattern(newPattern)
                    }
                    onClick={handleAddPattern}
                  >
                    Добавить
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Можно хранить как точные значения, так и регулярные выражения.
                </div>
              </div>

              <div className="rounded-md border p-3">
                {selectedGroup ? (
                  patterns.length ? (
                    <ul className="space-y-2">
                      {patterns.map((p) => (
                        <li
                          key={p}
                          className="flex items-center justify-between gap-3"
                        >
                          <code className="break-all rounded bg-muted px-2 py-1 text-sm">
                            {p}
                          </code>
                          <Button
                            variant="ghost"
                            className="text-destructive"
                            disabled={isSaving}
                            onClick={() => handleDeletePattern(p)}
                          >
                            Удалить
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      В группе пока нет записей.
                    </div>
                  )
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Сначала выберите или создайте группу.
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator className="my-6 flex bg-secondary" />
          <div className="text-sm text-muted-foreground">
            Изменения сохраняются в `config.yml` через API `PUT /config/set`.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

