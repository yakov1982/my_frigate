import ActivityIndicator from "@/components/indicators/activity-indicator";
import TimeAgo from "@/components/dynamic/TimeAgo";
import { useApiHost } from "@/api";
import useSWR from "swr";
import { FrigateConfig } from "@/types/frigateConfig";
import { useFormattedTimestamp } from "@/hooks/use-date-utils";
import { getIconForLabel } from "@/utils/iconUtil";
import { getTranslatedLabel } from "@/utils/i18n";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

function RecognitionRow({
  event,
  config,
}: {
  event: RecognitionEvent;
  config?: FrigateConfig;
}) {
  const apiHost = useApiHost();
  const { t } = useTranslation(["common", "views/explore"]);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const recognizedPlate = event.data?.recognized_license_plate;
  const hasFaceName = event.label === "person" && !!event.sub_label;

  const recognitionType = recognizedPlate
    ? "plate"
    : hasFaceName
      ? "face"
      : "other";

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

  return (
    <div className="flex w-full flex-row gap-3 rounded-lg border border-secondary-highlight bg-background_alt p-2">
      <div className="relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-md bg-secondary">
        {!imgLoaded && !imgFailed && <Skeleton className="size-full" />}
        {!imgFailed && (
          <img
            className={cn(
              "size-full object-cover object-center",
              !imgLoaded && "invisible",
            )}
            src={`${apiHost}api/events/${event.id}/thumbnail.webp`}
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

          <div className="flex flex-col items-end text-xs text-muted-foreground">
            <TimeAgo time={event.start_time * 1000} dense />
            <span className="whitespace-nowrap">{formattedDate}</span>
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

  const {
    data: recognitions,
    error,
    isValidating,
  } = useSWR<RecognitionEvent[]>(
    ["events/recognitions", { limit: 50 }],
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
    },
  );

  useEffect(() => {
    document.title = `${t("recognitions.title")} - Frigate`;
  }, [t]);

  const sortedRecognitions = useMemo(() => {
    if (!recognitions) {
      return [];
    }
    return [...recognitions].sort((a, b) => b.start_time - a.start_time);
  }, [recognitions]);

  return (
    <div className="scrollbar-container flex size-full flex-col overflow-y-auto p-2 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-lg font-semibold">{t("recognitions.title")}</div>
        {isValidating && <ActivityIndicator size={18} />}
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

      {recognitions && sortedRecognitions.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t("recognitions.empty")}
        </div>
      )}

      {sortedRecognitions.length > 0 && (
        <div className="flex flex-col gap-2">
          {sortedRecognitions.map((event) => (
            <RecognitionRow key={event.id} event={event} config={config} />
          ))}
        </div>
      )}
    </div>
  );
}

