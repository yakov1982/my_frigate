import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { FrigateConfig } from "@/types/frigateConfig";
import { LprAlertType } from "@/types/ws";
import { useLprAlerts } from "@/api/ws";
import { useApiHost } from "@/api";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  FaShieldAlt,
  FaBan,
  FaQuestionCircle,
  FaPlus,
  FaTrash,
  FaCar,
} from "react-icons/fa";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const MAX_ALERTS = 100;

function getStatusColor(status: string): string {
  switch (status) {
    case "whitelist":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "blacklist":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "whitelist":
      return <FaShieldAlt className="mr-1" />;
    case "blacklist":
      return <FaBan className="mr-1" />;
    default:
      return <FaQuestionCircle className="mr-1" />;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "whitelist":
      return "Allowed";
    case "blacklist":
      return "Blocked";
    default:
      return "Unknown";
  }
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toLocaleString();
}

export default function LprMonitor() {
  const { data: config } = useSWR<FrigateConfig>("config", {
    revalidateOnFocus: false,
  });
  const apiHost = useApiHost();
  const { payload: latestAlert } = useLprAlerts();

  // Alert history (in-memory, most recent first)
  const [alerts, setAlerts] = useState<LprAlertType[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<LprAlertType | null>(null);
  const alertSoundRef = useRef<HTMLAudioElement | null>(null);

  // Whitelist/blacklist management
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [newWhitelistPlate, setNewWhitelistPlate] = useState("");
  const [newBlacklistPlate, setNewBlacklistPlate] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{
    list: "whitelist" | "blacklist";
    plate: string;
  } | null>(null);

  // Load plate lists on mount
  useEffect(() => {
    axios
      .get(`${apiHost}api/lpr/plates/lists`)
      .then((res) => {
        if (res.data.success) {
          setWhitelist(res.data.whitelist || []);
          setBlacklist(res.data.blacklist || []);
        }
      })
      .catch(() => {
        // Silently handle errors - lists may not be configured
      });
  }, [apiHost]);

  // Process incoming LPR alerts
  useEffect(() => {
    if (!latestAlert) return;

    setAlerts((prev) => {
      // Deduplicate by id + plate combo within a short time window
      const isDuplicate = prev.some(
        (a) =>
          a.id === latestAlert.id &&
          a.plate === latestAlert.plate &&
          Math.abs(a.timestamp - latestAlert.timestamp) < 5,
      );
      if (isDuplicate) return prev;

      const updated = [latestAlert, ...prev].slice(0, MAX_ALERTS);
      return updated;
    });

    // Play sound for blacklisted plates
    if (latestAlert.list_status === "blacklist") {
      try {
        if (!alertSoundRef.current) {
          alertSoundRef.current = new Audio(
            "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdW+Bk42jq6uts6+lnZOJfHFqZGRteIGQm6StsbOxq6OYj4Z9c2plZGp1gI6aoay0tbGoo5mQh3xxaWZmbXiCkJuirLS1saqjmJCGfHJqZmZsd4OQnKOttbexqqOZkId8cmpkZm13g5Cco621tbCqo5mQh3xyamZmbXeCkJyjrbW1saqjmJCGfHJqZmZsd4OQnKOttbWxqqOZkId8cmpkZm13g5Cco621tbCqo5mQh312amZmbXeCkJylrba2squlmpGIfXNqZmdte4OSnaSutreyq6WakYh9c2pmZ215g5KdpK62t7KrpZqSiH1zamZnbXmDkp2krrW3squlmZKIfXNqZmdte4OSnaSutre0q6WakYh9c2pmZ214g5KdpK62t7KrpZqRiH5zamZnbXiEkp2kr7a3s6ulmZGIfnRqZmZteYSSnqWvtreyq6WakYh+c2pmZ214hJKepK+2t7KrpZqRiH5zamZnbXiEkp6lr7e4squlmZGHfnRsZmZteYSSnqWvtre0raWak4l+c2pmZ215hJKepbC3uLOtpZqTiX5za2dnbXmEkp6lsLe4s62mmpOJfnRrZmZteYSSn6awuLi0raabk4l+dGxmZ215hJKfprC4uLOtppuTiX90a2dmbXmGkp+msbi4tK6mm5OJf3RrZ2dteYaSnqaxuLi0rqabk4l/dGtnZm16hpOfprG4urSuppuTin90bGdnbXqGk5+msri5tK6nm5SKf3RrZ2dueoeUn6exuLm0rqeck4p/dGxnZ217hpSfp7G5ubSup5yUin90a2dncHuHlJ+nsbi5tK+nnJSKf3RrZ2dteoeUn6exubm0rqeclIp/dGxnZ217h5Sfp7K5ubWvp5yUi390a2dncHuHlJ+nsrm5ta+nnJSLf3VsZ2hue4eUoKeyubm1r6eclIuAdWtnZ3B7h5SgqLK5urWvp52Vi4B1bGhob3uHlKCosrq6tq+onZWLgHVsaGdwe4iUoKiyurq2sKielYuAdWxoaG97iJSgqLK6urWwqJ6Vi4B1bGhncHuIlKCosrq6trConpWMgHVsaGhve4iVoKmzurq2sKielYyAdmxoaHB7iJWhqbO6u7awqZ6VjIB2bWhncHuIlaGps7q7trGpnpWMgHZtaGhwe4mVoamzury2samflYyAdm1oZ3B8iZWhqbO6vLaxqZ+WjIF2bWhocHyJlaKptLq8trGpn5aMgXZtaGhwfImVoqm0ury2samfloyBdm1oaHB8iZWhqbS6vLaxqZ+WjYF2bWhocHyJlaKptLu8trGpn5aNgXZtaGhwfImVoqm0u7y3samfloyBdm1oaHB8iZWiqbS7vLexqZ+WjIF2bWhocHyJlaKptLu8t7Gpn5aNgXZtaGhwfImVoqm0u7y3sqmfloyBdm1oaHB8iZWiqbS7vLexqZ+WjYF2bWhocHyJlqKptLu9t7Kpn5aNgXZtaGhwfYqWoqq0u723sqmgloyBdm1oaHF9ipajqrW8vbiyrKCWjIF2bWhocH2KlqOqtby9uLKsoJaNgXZtaGhxfYqWo6q1vL24sqygloyBdm1oaHF9ipajqrW8vbiyq6CXjYJ3bWhocH2KlqOqtby+uLKsoJeNgndsaGhxfYqWo6q1vL64sqygl42Cd21paHF9i5ajqra8vriyq6CXjYJ3bWlocX2LlqSqtry+uLOsoJeNgndsaWhxfYuWpKq2vL64s6ygl42Cd21paHF9i5akqra8vriyq6CXjYJ3bWlpcX6MlqWrt728ubOsoZiOg3htaGhyfoyWpau3vb65s6yhmI6DeG1oaXJ+jJalq7e9vrm0rKGYjoN4bWhpcn6MlqWrt729ubOsoZiOg3htaWhyfoyWpau3vb65tKyhmI6DeG1oaXJ+jJalq7e9vrm0rKGZjoN4bWhpcn6NlqWrt729ubOtoZiOg3huaWhyfoyWpau3vr65tK2hmY+DeG1oaXJ+jZelq7e+vrm0rKGZj4N4bWhpcn6NlqWrt76+ubStoZmPg3htaWhyfoyWpau3vr65tKyhmI+DeG5oaXJ+jZelq7e+vrm0rKGZj4N4bWhpcn6NlqWrt76+ubStoZmPg3htaWhyfoyWpau3vr6/AA==",
          );
        }
        alertSoundRef.current.play().catch(() => {});
      } catch {
        // Audio play can fail silently
      }
    }
  }, [latestAlert]);

  // Plate list management
  const handleAddPlate = useCallback(
    (list: "whitelist" | "blacklist", plate: string) => {
      if (!plate.trim()) return;

      axios
        .post(`${apiHost}api/lpr/plates/${list}`, { plate: plate.trim() })
        .then((res) => {
          if (res.data.success) {
            if (list === "whitelist") {
              setWhitelist((prev) => [...prev, plate.trim()]);
              setNewWhitelistPlate("");
            } else {
              setBlacklist((prev) => [...prev, plate.trim()]);
              setNewBlacklistPlate("");
            }
            toast.success(`Plate "${plate.trim()}" added to ${list}.`);
          }
        })
        .catch(() => toast.error(`Failed to add plate to ${list}.`));
    },
    [apiHost],
  );

  const handleRemovePlate = useCallback(
    (list: "whitelist" | "blacklist", plate: string) => {
      axios
        .delete(`${apiHost}api/lpr/plates/${list}`, {
          data: { plate },
        })
        .then((res) => {
          if (res.data.success) {
            if (list === "whitelist") {
              setWhitelist((prev) => prev.filter((p) => p !== plate));
            } else {
              setBlacklist((prev) => prev.filter((p) => p !== plate));
            }
            toast.success(`Plate "${plate}" removed from ${list}.`);
          }
        })
        .catch(() => toast.error(`Failed to remove plate from ${list}.`));
      setDeleteConfirm(null);
    },
    [apiHost],
  );

  const lprEnabled = config?.lpr?.enabled ?? false;

  // Filter controls
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const filteredAlerts = useMemo(() => {
    if (statusFilter === "all") return alerts;
    return alerts.filter((a) => a.list_status === statusFilter);
  }, [alerts, statusFilter]);

  if (!lprEnabled) {
    return (
      <div className="flex size-full flex-col items-center justify-center p-4">
        <FaCar className="mb-4 size-16 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">
          License Plate Recognition Disabled
        </h2>
        <p className="text-center text-muted-foreground">
          Enable LPR in your Frigate configuration to use the plate monitoring
          feature.
        </p>
      </div>
    );
  }

  return (
    <div className="flex size-full flex-col gap-2 overflow-hidden p-2">
      <Toaster position="top-center" closeButton={true} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">License Plate Monitor</h1>
        <div className="flex items-center gap-2">
          <Badge
            className={cn(
              "cursor-pointer",
              statusFilter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground",
            )}
            onClick={() => setStatusFilter("all")}
          >
            All ({alerts.length})
          </Badge>
          <Badge
            className={cn(
              "cursor-pointer",
              statusFilter === "blacklist"
                ? "bg-red-500 text-white"
                : "bg-red-500/20 text-red-400",
            )}
            onClick={() =>
              setStatusFilter(
                statusFilter === "blacklist" ? "all" : "blacklist",
              )
            }
          >
            <FaBan className="mr-1" />
            Blocked ({alerts.filter((a) => a.list_status === "blacklist").length}
            )
          </Badge>
          <Badge
            className={cn(
              "cursor-pointer",
              statusFilter === "whitelist"
                ? "bg-green-500 text-white"
                : "bg-green-500/20 text-green-400",
            )}
            onClick={() =>
              setStatusFilter(
                statusFilter === "whitelist" ? "all" : "whitelist",
              )
            }
          >
            <FaShieldAlt className="mr-1" />
            Allowed (
            {alerts.filter((a) => a.list_status === "whitelist").length})
          </Badge>
          <Badge
            className={cn(
              "cursor-pointer",
              statusFilter === "unknown"
                ? "bg-yellow-500 text-white"
                : "bg-yellow-500/20 text-yellow-400",
            )}
            onClick={() =>
              setStatusFilter(
                statusFilter === "unknown" ? "all" : "unknown",
              )
            }
          >
            <FaQuestionCircle className="mr-1" />
            Unknown ({alerts.filter((a) => a.list_status === "unknown").length})
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="monitor" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="w-fit">
          <TabsTrigger value="monitor">Live Monitor</TabsTrigger>
          <TabsTrigger value="lists">Plate Lists</TabsTrigger>
        </TabsList>

        {/* Live Monitor Tab */}
        <TabsContent
          value="monitor"
          className="flex-1 overflow-hidden"
        >
          <div className="flex size-full gap-2 overflow-hidden">
            {/* Alert list */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <ScrollArea className="size-full">
                {filteredAlerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <FaCar className="mb-4 size-12" />
                    <p>No license plate alerts yet.</p>
                    <p className="text-sm">
                      Plates will appear here when detected.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {filteredAlerts.map((alert, idx) => (
                      <Card
                        key={`${alert.id}-${alert.timestamp}-${idx}`}
                        className={cn(
                          "cursor-pointer transition-all hover:shadow-lg",
                          alert.list_status === "blacklist" &&
                            "border-red-500/50 shadow-red-500/10",
                          alert.list_status === "whitelist" &&
                            "border-green-500/30",
                          selectedAlert?.id === alert.id &&
                            selectedAlert?.timestamp === alert.timestamp &&
                            "ring-2 ring-primary",
                        )}
                        onClick={() => setSelectedAlert(alert)}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="font-mono text-xl tracking-wider">
                              {alert.plate}
                            </CardTitle>
                            <Badge
                              className={cn(
                                "flex items-center",
                                getStatusColor(alert.list_status),
                              )}
                            >
                              {getStatusIcon(alert.list_status)}
                              {getStatusLabel(alert.list_status)}
                            </Badge>
                          </div>
                          <CardDescription className="flex items-center justify-between">
                            <span>{alert.camera}</span>
                            <span className="text-xs">
                              {formatTimestamp(alert.timestamp)}
                            </span>
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pb-3">
                          {alert.snapshot ? (
                            <img
                              src={`data:image/jpeg;base64,${alert.snapshot}`}
                              alt={`Vehicle with plate ${alert.plate}`}
                              className="h-32 w-full rounded-md object-cover"
                            />
                          ) : (
                            <div className="flex h-32 items-center justify-center rounded-md bg-muted">
                              <FaCar className="size-8 text-muted-foreground" />
                            </div>
                          )}
                          <div className="mt-2 flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Confidence:{" "}
                              {Math.round((alert.score || 0) * 100)}%
                            </span>
                            {alert.known_name && (
                              <Badge variant="outline">
                                {alert.known_name}
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Detail panel */}
            {selectedAlert && (
              <Card className="hidden w-96 shrink-0 lg:block">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FaCar />
                    Plate Detail
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {selectedAlert.snapshot ? (
                    <img
                      src={`data:image/jpeg;base64,${selectedAlert.snapshot}`}
                      alt={`Vehicle with plate ${selectedAlert.plate}`}
                      className="w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-48 items-center justify-center rounded-lg bg-muted">
                      <FaCar className="size-16 text-muted-foreground" />
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <span className="text-sm text-muted-foreground">
                        License Plate
                      </span>
                      <p className="font-mono text-2xl font-bold tracking-widest">
                        {selectedAlert.plate}
                      </p>
                    </div>

                    <div>
                      <span className="text-sm text-muted-foreground">
                        Status
                      </span>
                      <div className="mt-1">
                        <Badge
                          className={cn(
                            "flex w-fit items-center text-sm",
                            getStatusColor(selectedAlert.list_status),
                          )}
                        >
                          {getStatusIcon(selectedAlert.list_status)}
                          {getStatusLabel(selectedAlert.list_status)}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-sm text-muted-foreground">
                          Camera
                        </span>
                        <p className="font-medium">{selectedAlert.camera}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          Confidence
                        </span>
                        <p className="font-medium">
                          {Math.round((selectedAlert.score || 0) * 100)}%
                        </p>
                      </div>
                    </div>

                    <div>
                      <span className="text-sm text-muted-foreground">
                        Detected At
                      </span>
                      <p className="font-medium">
                        {formatTimestamp(selectedAlert.timestamp)}
                      </p>
                    </div>

                    {selectedAlert.known_name && (
                      <div>
                        <span className="text-sm text-muted-foreground">
                          Known Name
                        </span>
                        <p className="font-medium">
                          {selectedAlert.known_name}
                        </p>
                      </div>
                    )}

                    {/* Quick action buttons */}
                    <div className="flex gap-2 pt-2">
                      {selectedAlert.list_status !== "whitelist" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-green-500/30 text-green-500 hover:bg-green-500/10"
                          onClick={() =>
                            handleAddPlate("whitelist", selectedAlert.plate)
                          }
                        >
                          <FaShieldAlt className="mr-1" />
                          Add to Whitelist
                        </Button>
                      )}
                      {selectedAlert.list_status !== "blacklist" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-red-500/30 text-red-500 hover:bg-red-500/10"
                          onClick={() =>
                            handleAddPlate("blacklist", selectedAlert.plate)
                          }
                        >
                          <FaBan className="mr-1" />
                          Add to Blacklist
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Plate Lists Management Tab */}
        <TabsContent value="lists" className="flex-1 overflow-hidden">
          <div className="grid size-full grid-cols-1 gap-4 overflow-auto md:grid-cols-2">
            {/* Whitelist */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-500">
                  <FaShieldAlt />
                  Whitelist (Allowed Plates)
                </CardTitle>
                <CardDescription>
                  Plates in this list are marked as allowed when detected.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex gap-2">
                  <Input
                    placeholder="Enter plate number or regex..."
                    value={newWhitelistPlate}
                    onChange={(e) => setNewWhitelistPlate(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        handleAddPlate("whitelist", newWhitelistPlate);
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      handleAddPlate("whitelist", newWhitelistPlate)
                    }
                  >
                    <FaPlus className="mr-1" />
                    Add
                  </Button>
                </div>
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plate Pattern</TableHead>
                        <TableHead className="w-16">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {whitelist.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={2}
                            className="text-center text-muted-foreground"
                          >
                            No plates in whitelist
                          </TableCell>
                        </TableRow>
                      ) : (
                        whitelist.map((plate) => (
                          <TableRow key={plate}>
                            <TableCell className="font-mono">
                              {plate}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() =>
                                  setDeleteConfirm({
                                    list: "whitelist",
                                    plate,
                                  })
                                }
                              >
                                <FaTrash />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Blacklist */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-500">
                  <FaBan />
                  Blacklist (Blocked Plates)
                </CardTitle>
                <CardDescription>
                  Plates in this list trigger an alert when detected.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex gap-2">
                  <Input
                    placeholder="Enter plate number or regex..."
                    value={newBlacklistPlate}
                    onChange={(e) => setNewBlacklistPlate(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        handleAddPlate("blacklist", newBlacklistPlate);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      handleAddPlate("blacklist", newBlacklistPlate)
                    }
                  >
                    <FaPlus className="mr-1" />
                    Add
                  </Button>
                </div>
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plate Pattern</TableHead>
                        <TableHead className="w-16">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {blacklist.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={2}
                            className="text-center text-muted-foreground"
                          >
                            No plates in blacklist
                          </TableCell>
                        </TableRow>
                      ) : (
                        blacklist.map((plate) => (
                          <TableRow key={plate}>
                            <TableCell className="font-mono">
                              {plate}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() =>
                                  setDeleteConfirm({
                                    list: "blacklist",
                                    plate,
                                  })
                                }
                              >
                                <FaTrash />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteConfirm !== null}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Plate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove &quot;{deleteConfirm?.plate}&quot;
              from the {deleteConfirm?.list}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirm) {
                  handleRemovePlate(deleteConfirm.list, deleteConfirm.plate);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
