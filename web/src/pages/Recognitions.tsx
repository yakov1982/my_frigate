import ActivityIndicator from "@/components/indicators/activity-indicator";
import TimeAgo from "@/components/dynamic/TimeAgo";
import { useApiHost } from "@/api";
import useSWR from "swr";
import { FrigateConfig } from "@/types/frigateConfig";
import { useFormattedTimestamp } from "@/hooks/use-date-utils";
import { useAllowedCameras } from "@/hooks/use-allowed-cameras";
import { useUserPersistence } from "@/hooks/use-user-persistence";
import { getIconForLabel } from "@/utils/iconUtil";
import { getTranslatedLabel } from "@/utils/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import PlatformAwareDialog from "@/components/overlay/dialog/PlatformAwareDialog";
import FilterSwitch from "@/components/filter/FilterSwitch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FaCog } from "react-icons/fa";
import { LuExternalLink, LuFileVideo, LuImage, LuRefreshCcw } from "react-icons/lu";
import { useNavigate } from "react-router-dom";

type RecognitionEvent = {
  id: string;
  camera: string;
  label: string;
  sub_label?: string | null;
  start_time: number;
  end_time?: number | null;
  has_clip: boolean;
  has_snapshot: boolean;
  false_positive?: boolean | null;
  zones?: string[];
  data?: {
    type?: "object" | "audio" | "manual";
    recognized_license_plate?: string;
    license_plate_status?: string;
    license_plate_status_label?: string;
    [key: string]: unknown;
  };
};

type RecognitionType = "face" | "plate" | "other";
type PlateStatusFilter = "all" | "blacklist" | "whitelist" | "none";
type ImageMode = "auto" | "thumbnail" | "snapshot" | "off";

function getLicensePlateStatusText(
  t: (key: string, opts?: Record<string, unknown>) => string,
  event: RecognitionEvent,
): string | null {
  const status = event.data?.license_plate_status;
  if (!status || status === "none") {
    return null;
  }

  const translatedStatus = t(`details.licensePlateStatus.${status}`, {
    ns: "views/explore",
  });
  const label = event.data?.license_plate_status_label;

  return label ? `${translatedStatus}: ${label}` : translatedStatus;
}

function getRecognitionType(event: RecognitionEvent): RecognitionType {
  if (event.data?.recognized_license_plate) {
    return "plate";
  }

  if (event.label === "person" && event.sub_label) {
    return "face";
  }

  return "other";
}

function playBeep() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioContext: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) {
      return;
    }

    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.05;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 180);
  } catch {
    // ignore audio errors (browser policy, no device, etc)
  }
}

function RecognitionRow({
  event,
  config,
  imageMode,
  isNew,
  onOpenInExplore,
}: {
  event: RecognitionEvent;
  config?: FrigateConfig;
  imageMode: ImageMode;
  isNew: boolean;
  onOpenInExplore: (event: RecognitionEvent) => void;
}) {
  const apiHost = useApiHost();
  const { t } = useTranslation(["common", "views/explore"]);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const recognizedPlate = event.data?.recognized_license_plate;
  const recognitionType = getRecognitionType(event);

  const displayName =
    recognizedPlate ?? event.sub_label ?? getTranslatedLabel(event.label, "object");

  const plateStatusText = useMemo(
    () => getLicensePlateStatusText(t, event),
    [event, t],
  );

  const formattedDate = useFormattedTimestamp(
    event.start_time,
    config?.ui.time_format === "24hour"
      ? t("time.formattedTimestampMonthDayHourMinute.24hour", { ns: "common" })
      : t("time.formattedTimestampMonthDayHourMinute.12hour", { ns: "common" }),
    config?.ui.timezone,
  );

  const showPlateStatus = !!recognizedPlate && !!plateStatusText;

  const imageUrl = useMemo(() => {
    if (imageMode === "off") {
      return null;
    }

    const thumbnail = `${apiHost}api/events/${event.id}/thumbnail.webp`;
    const snapshot = `${apiHost}api/events/${event.id}/snapshot.jpg`;

    if (imageMode === "thumbnail") {
      return thumbnail;
    }
    if (imageMode === "snapshot") {
      return event.has_snapshot ? snapshot : thumbnail;
    }

    // auto
    return event.has_snapshot ? snapshot : thumbnail;
  }, [apiHost, event.has_snapshot, event.id, imageMode]);

  const isBlacklisted = event.data?.license_plate_status === "blacklist";

  return (
    <div
      className={cn(
        "flex w-full flex-row gap-3 rounded-lg border bg-background_alt p-2",
        isBlacklisted ? "border-destructive/60" : "border-secondary-highlight",
        isNew && (isBlacklisted ? "ring-2 ring-destructive" : "ring-2 ring-primary"),
        "cursor-pointer hover:bg-accent/30",
      )}
      onClick={() => onOpenInExplore(event)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onOpenInExplore(event);
        }
      }}
    >
      {imageMode !== "off" && (
        <div className="relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-md bg-secondary">
          {!imgLoaded && !imgFailed && <Skeleton className="size-full" />}
          {!imgFailed && imageUrl && (
            <img
              className={cn(
                "size-full object-cover object-center",
                !imgLoaded && "invisible",
              )}
              src={imageUrl}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => {
                setImgFailed(true);
                setImgLoaded(true);
              }}
            />
          )}
          {imgFailed && (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
              {t("recognitions.noPhoto")}
            </div>
          )}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="flex min-w-0 flex-row items-start justify-between gap-2">
          <div className="flex min-w-0 flex-row flex-wrap items-center gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              {getIconForLabel(event.label, event.data?.type, "size-3")}
              <span className="smart-capitalize">
                {getTranslatedLabel(event.label, event.data?.type)}
              </span>
            </Badge>
            <Badge variant="outline" className="capitalize">
              {t(`recognitions.type.${recognitionType}`)}
            </Badge>
            {showPlateStatus && (
              <Badge
                variant={
                  event.data?.license_plate_status === "blacklist"
                    ? "destructive"
                    : "default"
                }
              >
                {plateStatusText}
              </Badge>
            )}
          </div>

          <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="xs"
                aria-label={t("recognitions.actions.openInExplore")}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInExplore(event);
                }}
              >
                <LuExternalLink className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                aria-label={t("recognitions.actions.openSnapshot")}
                disabled={!event.has_snapshot}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(
                    `${apiHost}api/events/${event.id}/snapshot.jpg`,
                    "_blank",
                  );
                }}
              >
                <LuImage className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                aria-label={t("recognitions.actions.openClip")}
                disabled={!event.has_clip}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`${apiHost}api/events/${event.id}/clip.mp4`, "_blank");
                }}
              >
                <LuFileVideo className="size-4" />
              </Button>
            </div>

            <div className="flex flex-col items-end">
              <TimeAgo time={event.start_time * 1000} dense />
              <span className="whitespace-nowrap">{formattedDate}</span>
            </div>
          </div>
        </div>

        <div className="mt-1 flex min-w-0 flex-col">
          <div className="truncate text-base font-semibold">{displayName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {t("details.camera", { ns: "views/explore" })}: {event.camera}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Recognitions() {
  const { t } = useTranslation(["common"]);

  const { data: config } = useSWR<FrigateConfig>("config", {
    revalidateOnFocus: false,
  });
  const allowedCameras = useAllowedCameras();
  const navigate = useNavigate();

  // Preferences
  const [autoRefresh, setAutoRefresh] = useUserPersistence<boolean>(
    "recognitionsAutoRefresh",
    true,
  );
  const [refreshIntervalMs, setRefreshIntervalMs] = useUserPersistence<number>(
    "recognitionsRefreshIntervalMs",
    5000,
  );
  const [autoScroll, setAutoScroll] = useUserPersistence<boolean>(
    "recognitionsAutoScroll",
    true,
  );
  const [soundOnBlacklist, setSoundOnBlacklist] = useUserPersistence<boolean>(
    "recognitionsSoundOnBlacklist",
    false,
  );
  const [imageMode, setImageMode] = useUserPersistence<ImageMode>(
    "recognitionsImageMode",
    "auto",
  );
  const [limit, setLimit] = useUserPersistence<number>("recognitionsLimit", 50);

  // Filters
  const [selectedCameras, setSelectedCameras] = useUserPersistence<string[]>(
    "recognitionsCameras",
    [],
  );
  const [types, setTypes] = useUserPersistence<RecognitionType[]>(
    "recognitionsTypes",
    ["face", "plate"],
  );
  const [plateStatusFilter, setPlateStatusFilter] =
    useUserPersistence<PlateStatusFilter>(
      "recognitionsPlateStatusFilter",
      "all",
    );
  const [query, setQuery] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const [isAtTop, setIsAtTop] = useState(true);

  // Track "new" items (for highlight + optional blacklist beep).
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const camerasParam = useMemo(() => {
    const cams = (selectedCameras || []).filter((c) =>
      allowedCameras.includes(c),
    );
    return cams.length ? cams.join(",") : undefined;
  }, [allowedCameras, selectedCameras]);

  const swrKey = useMemo(() => {
    return [
      "events/recognitions",
      {
        limit: limit ?? 50,
        ...(camerasParam ? { cameras: camerasParam } : {}),
      },
    ] as const;
  }, [camerasParam, limit]);

  const {
    data: recognitions,
    error,
    isValidating,
    mutate,
  } = useSWR<RecognitionEvent[]>(swrKey, {
    refreshInterval: autoRefresh ? refreshIntervalMs ?? 5000 : 0,
    revalidateOnFocus: true,
  });

  useEffect(() => {
    document.title = `${t("recognitions.title")} - Frigate`;
  }, [t]);

  const filteredRecognitions = useMemo(() => {
    const list = recognitions ? [...recognitions] : [];
    list.sort((a, b) => b.start_time - a.start_time);

    const queryNorm = query.trim().toLowerCase();

    return list.filter((event) => {
      const type = getRecognitionType(event);

      if (types && types.length > 0 && !types.includes(type)) {
        return false;
      }

      if (type === "plate" && plateStatusFilter !== "all") {
        const status = (event.data?.license_plate_status || "none") as string;
        if (plateStatusFilter === "none") {
          if (status !== "none") return false;
        } else {
          if (status !== plateStatusFilter) return false;
        }
      }

      if (!queryNorm) {
        return true;
      }

      const displayName =
        event.data?.recognized_license_plate ??
        event.sub_label ??
        getTranslatedLabel(event.label, "object");
      const statusLabel = event.data?.license_plate_status_label ?? "";

      return (
        `${displayName}`.toLowerCase().includes(queryNorm) ||
        `${event.camera}`.toLowerCase().includes(queryNorm) ||
        `${statusLabel}`.toLowerCase().includes(queryNorm)
      );
    });
  }, [plateStatusFilter, query, recognitions, types]);

  useEffect(() => {
    if (!recognitions || recognitions.length === 0) {
      return;
    }

    const newlyAdded = recognitions
      .map((e) => e.id)
      .filter((id) => !seenIdsRef.current.has(id));

    if (newlyAdded.length === 0) {
      return;
    }

    // mark as seen
    newlyAdded.forEach((id) => seenIdsRef.current.add(id));
    // avoid unbounded growth when the page is left open for days
    if (seenIdsRef.current.size > 2000) {
      seenIdsRef.current = new Set(recognitions.map((e) => e.id));
    }

    setNewIds((prev) => {
      const next = new Set(prev);
      newlyAdded.forEach((id) => next.add(id));
      return next;
    });

    // Optional: beep when a new blacklisted plate arrives.
    if (soundOnBlacklist) {
      const anyNewBlacklisted = recognitions.some(
        (e) =>
          newlyAdded.includes(e.id) &&
          e.data?.license_plate_status === "blacklist",
      );
      if (anyNewBlacklisted) {
        playBeep();
      }
    }

    // Cleanup highlight after a short duration.
    const timeout = setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev);
        newlyAdded.forEach((id) => next.delete(id));
        return next;
      });
    }, 15000);

    return () => clearTimeout(timeout);
  }, [recognitions, soundOnBlacklist]);

  const onOpenInExplore = useCallback(
    (event: RecognitionEvent) => {
      const type = getRecognitionType(event);
      if (type === "plate" && event.data?.recognized_license_plate) {
        navigate(
          `/explore?recognized_license_plate=${encodeURIComponent(
            event.data.recognized_license_plate,
          )}&cameras=${encodeURIComponent(event.camera)}`,
        );
        return;
      }

      if (type === "face" && event.sub_label) {
        navigate(
          `/explore?labels=person&sub_labels=${encodeURIComponent(
            event.sub_label,
          )}&cameras=${encodeURIComponent(event.camera)}`,
        );
        return;
      }

      navigate(`/explore?cameras=${encodeURIComponent(event.camera)}`);
    },
    [navigate],
  );

  const onScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    setIsAtTop(el.scrollTop < 10);
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScroll, filteredRecognitions.length]);

  useEffect(() => {
    if (!autoScroll || !contentRef.current) {
      return;
    }
    if (!isAtTop) {
      return;
    }
    contentRef.current.scrollTo({ top: 0, behavior: "smooth" });
  }, [autoScroll, filteredRecognitions, isAtTop]);

  const cameraLabel = useMemo(() => {
    const cams = (selectedCameras || []).filter((c) =>
      allowedCameras.includes(c),
    );
    if (cams.length === 0) {
      return t("recognitions.filters.camerasAll");
    }
    return t("recognitions.filters.camerasSelected", { count: cams.length });
  }, [allowedCameras, selectedCameras, t]);

  const settingsTrigger = (
    <Button
      className="flex items-center gap-2"
      size="sm"
      aria-label={t("recognitions.settings.title")}
    >
      <FaCog className="text-secondary-foreground" />
      {t("recognitions.settings.title")}
    </Button>
  );

  const settingsContent = (
    <div className="my-3 space-y-5 py-3 md:mt-0 md:py-0">
      <div className="space-y-2">
        <div className="text-md">{t("recognitions.settings.refresh.title")}</div>
        <div className="space-y-2">
          <FilterSwitch
            label={t("recognitions.settings.refresh.auto")}
            isChecked={autoRefresh ?? true}
            onCheckedChange={setAutoRefresh}
          />
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              {t("recognitions.settings.refresh.interval")}
            </div>
            <Select
              value={`${refreshIntervalMs ?? 5000}`}
              onValueChange={(value) => setRefreshIntervalMs(Number(value))}
              disabled={!(autoRefresh ?? true)}
            >
              <SelectTrigger className="w-full">
                {t("recognitions.settings.refresh.intervalValue", {
                  ms: refreshIntervalMs ?? 5000,
                })}
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {[1000, 2000, 5000, 10000, 30000].map((ms) => (
                    <SelectItem
                      key={ms}
                      value={`${ms}`}
                      className="cursor-pointer"
                    >
                      {t("recognitions.settings.refresh.intervalValue", { ms })}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <DropdownMenuSeparator />

      <div className="space-y-2">
        <div className="text-md">{t("recognitions.settings.display.title")}</div>
        <FilterSwitch
          label={t("recognitions.settings.display.autoScroll")}
          isChecked={autoScroll ?? true}
          onCheckedChange={setAutoScroll}
        />
        <FilterSwitch
          label={t("recognitions.settings.display.soundOnBlacklist")}
          isChecked={soundOnBlacklist ?? false}
          onCheckedChange={setSoundOnBlacklist}
        />
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {t("recognitions.settings.display.imageMode")}
          </div>
          <Select
            value={imageMode ?? "auto"}
            onValueChange={(value) => setImageMode(value as ImageMode)}
          >
            <SelectTrigger className="w-full">
              {t(
                `recognitions.settings.display.imageModeValue.${imageMode ?? "auto"}`,
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(["auto", "thumbnail", "snapshot", "off"] as ImageMode[]).map(
                  (v) => (
                    <SelectItem
                      key={v}
                      value={v}
                      className="cursor-pointer"
                    >
                      {t(`recognitions.settings.display.imageModeValue.${v}`)}
                    </SelectItem>
                  ),
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {t("recognitions.settings.display.limit")}
          </div>
          <Select
            value={`${limit ?? 50}`}
            onValueChange={(value) => setLimit(Number(value))}
          >
            <SelectTrigger className="w-full">{limit ?? 50}</SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {[25, 50, 100, 200].map((v) => (
                  <SelectItem
                    key={v}
                    value={`${v}`}
                    className="cursor-pointer"
                  >
                    {v}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  return (
    <div className="scrollbar-container flex size-full flex-col overflow-hidden p-2 md:p-4">
      <div className="mb-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-lg font-semibold">{t("recognitions.title")}</div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("recognitions.actions.refresh")}
              onClick={() => mutate()}
            >
              <LuRefreshCcw className="mr-2 size-4" />
              {t("recognitions.actions.refresh")}
            </Button>
            <PlatformAwareDialog
              trigger={settingsTrigger}
              content={settingsContent}
              contentClassName="scrollbar-container h-auto max-h-[80dvh] overflow-y-auto px-4 md:px-0"
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
            />
            {isValidating && <ActivityIndicator size={18} />}
          </div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("recognitions.filters.searchPlaceholder")}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="whitespace-nowrap">
                  {cameraLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-[60dvh] overflow-y-auto">
                <DropdownMenuLabel>
                  {t("recognitions.filters.camerasTitle")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={(selectedCameras?.length ?? 0) === 0}
                  onCheckedChange={() => setSelectedCameras([])}
                >
                  {t("recognitions.filters.camerasAll")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {allowedCameras.map((cam) => (
                  <DropdownMenuCheckboxItem
                    key={cam}
                    checked={selectedCameras?.includes(cam) ?? false}
                    onCheckedChange={(checked) => {
                      const current = selectedCameras ?? [];
                      if (checked) {
                        setSelectedCameras([...new Set([...current, cam])]);
                      } else {
                        setSelectedCameras(current.filter((c) => c !== cam));
                      }
                    }}
                  >
                    {cam}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
            <ToggleGroup
              type="multiple"
              value={types ?? ["face", "plate"]}
              onValueChange={(value) => setTypes(value as RecognitionType[])}
              className="justify-start md:justify-end"
            >
              <ToggleGroupItem value="face">
                {t("recognitions.filters.type.face")}
              </ToggleGroupItem>
              <ToggleGroupItem value="plate">
                {t("recognitions.filters.type.plate")}
              </ToggleGroupItem>
              <ToggleGroupItem value="other">
                {t("recognitions.filters.type.other")}
              </ToggleGroupItem>
            </ToggleGroup>

            <ToggleGroup
              type="single"
              value={plateStatusFilter ?? "all"}
              onValueChange={(value) =>
                setPlateStatusFilter((value as PlateStatusFilter) || "all")
              }
              className="justify-start md:justify-end"
            >
              <ToggleGroupItem value="all">
                {t("recognitions.filters.status.all")}
              </ToggleGroupItem>
              <ToggleGroupItem value="whitelist">
                {t("recognitions.filters.status.whitelist")}
              </ToggleGroupItem>
              <ToggleGroupItem value="blacklist">
                {t("recognitions.filters.status.blacklist")}
              </ToggleGroupItem>
              <ToggleGroupItem value="none">
                {t("recognitions.filters.status.none")}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {!isAtTop && (
          <div className="flex items-center justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })
              }
            >
              {t("recognitions.actions.jumpToTop")}
            </Button>
          </div>
        )}
      </div>

      {!recognitions && !error && (
        <div className="flex flex-1 items-center justify-center">
          <ActivityIndicator />
        </div>
      )}

      {error && (
        <div className="flex flex-1 items-center justify-center text-sm text-destructive">
          {t("recognitions.failedToLoad")}
        </div>
      )}

      {recognitions && filteredRecognitions.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t("recognitions.empty")}
        </div>
      )}

      {filteredRecognitions.length > 0 && (
        <div
          ref={contentRef}
          className="scrollbar-container flex flex-1 flex-col gap-2 overflow-y-auto"
        >
          {filteredRecognitions.map((event) => (
            <RecognitionRow
              key={event.id}
              event={event}
              config={config}
              imageMode={imageMode ?? "auto"}
              isNew={newIds.has(event.id)}
              onOpenInExplore={onOpenInExplore}
            />
          ))}
        </div>
      )}
    </div>
  );
}

