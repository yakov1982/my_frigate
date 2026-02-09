import Heading from "@/components/ui/heading";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import useSWR from "swr";
import axios from "axios";
import { FrigateConfig } from "@/types/frigateConfig";
import { useTranslation } from "react-i18next";
import CameraEditForm from "@/components/settings/CameraEditForm";
import CameraWizardDialog from "@/components/settings/CameraWizardDialog";
import { LuPlus, LuPencil, LuTrash2 } from "react-icons/lu";
import { IoMdArrowRoundBack } from "react-icons/io";
import { isDesktop } from "react-device-detect";
import { CameraNameLabel } from "@/components/camera/FriendlyNameLabel";
import { Switch } from "@/components/ui/switch";
import { Trans } from "react-i18next";
import { Separator } from "@/components/ui/separator";
import { useEnabledState } from "@/api/ws";
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
import { toast } from "sonner";

type CameraManagementViewProps = {
  setUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function CameraManagementView({
  setUnsavedChanges,
}: CameraManagementViewProps) {
  const { t } = useTranslation(["views/settings"]);

  const { data: config, mutate: updateConfig } =
    useSWR<FrigateConfig>("config");

  const [viewMode, setViewMode] = useState<"settings" | "add" | "edit">(
    "settings",
  ); // Control view state
  const [editCameraName, setEditCameraName] = useState<string | undefined>(
    undefined,
  ); // Track camera being edited
  const [showWizard, setShowWizard] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cameraToDelete, setCameraToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // List of cameras for dropdown
  const cameras = useMemo(() => {
    if (config) {
      return Object.keys(config.cameras).sort();
    }
    return [];
  }, [config]);

  useEffect(() => {
    document.title = t("documentTitle.cameraManagement");
  }, [t]);

  // Handle back navigation from add/edit form
  const handleBack = useCallback(() => {
    setViewMode("settings");
    setEditCameraName(undefined);
    setUnsavedChanges(false);
    updateConfig();
  }, [updateConfig, setUnsavedChanges]);

  const handleEdit = useCallback((cameraName: string) => {
    setEditCameraName(cameraName);
    setViewMode("edit");
  }, []);

  const handleDeleteClick = useCallback((cameraName: string) => {
    setCameraToDelete(cameraName);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!cameraToDelete) return;
    setIsDeleting(true);
    try {
      await axios.put("config/set", {
        requires_restart: 1,
        config_data: {
          cameras: {
            [cameraToDelete]: null,
          },
        },
        update_topic: `config/cameras/${cameraToDelete}/remove`,
      });
      toast.success(t("cameraManagement.streams.deleteSuccess", { name: cameraToDelete }));
      setDeleteDialogOpen(false);
      setCameraToDelete(null);
      updateConfig();
    } catch (error) {
      const axiosError = error as { response?: { data?: { message?: string; detail?: string } }; message?: string };
      const errorMessage =
        axiosError.response?.data?.message ||
        axiosError.response?.data?.detail ||
        axiosError.message ||
        "Failed to delete camera";
      toast.error(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  }, [cameraToDelete, t, updateConfig]);

  return (
    <>
      <Toaster
        richColors
        className="z-[1000]"
        position="top-center"
        closeButton
      />
      <div className="flex size-full flex-col md:flex-row">
        <div className="scrollbar-container order-last mb-2 mt-2 flex h-full w-full flex-col overflow-y-auto pb-2 md:order-none">
          {viewMode === "settings" ? (
            <>
              <Heading as="h4" className="mb-2">
                {t("cameraManagement.title")}
              </Heading>
              <div className="my-4 flex flex-col gap-4">
                <Button
                  variant="select"
                  onClick={() => setShowWizard(true)}
                  className="flex max-w-48 items-center gap-2"
                >
                  <LuPlus className="h-4 w-4" />
                  {t("cameraManagement.addCamera")}
                </Button>
                {cameras.length > 0 && (
                  <>
                    <Separator className="my-2 flex bg-secondary" />
                    <div className="max-w-7xl space-y-4">
                      <Heading as="h4" className="my-2">
                        <Trans ns="views/settings">
                          cameraManagement.streams.title
                        </Trans>
                      </Heading>
                      <div className="mt-3 text-sm text-muted-foreground">
                        <Trans ns="views/settings">
                          cameraManagement.streams.desc
                        </Trans>
                      </div>

                      <div className="max-w-md space-y-2 rounded-lg bg-secondary p-4">
                        {cameras.map((camera) => (
                          <div
                            key={camera}
                            className="flex items-center justify-between gap-2 smart-capitalize"
                          >
                            <CameraNameLabel camera={camera} className="flex-1 min-w-0" />
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                aria-label={t("cameraManagement.streams.edit")}
                                onClick={() => handleEdit(camera)}
                              >
                                <LuPencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                aria-label={t("cameraManagement.streams.delete")}
                                onClick={() => handleDeleteClick(camera)}
                              >
                                <LuTrash2 className="h-4 w-4" />
                              </Button>
                              <CameraEnableSwitch cameraName={camera} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator className="mb-2 mt-4 flex bg-secondary" />
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2">
                <Button
                  className={`flex items-center gap-2.5 rounded-lg`}
                  aria-label={t("label.back", { ns: "common" })}
                  size="sm"
                  onClick={handleBack}
                >
                  <IoMdArrowRoundBack className="size-5 text-secondary-foreground" />
                  {isDesktop && (
                    <div className="text-primary">
                      {t("button.back", { ns: "common" })}
                    </div>
                  )}
                </Button>
              </div>
              <div className="md:max-w-5xl">
                <CameraEditForm
                  cameraName={viewMode === "edit" ? editCameraName : undefined}
                  onSave={handleBack}
                  onCancel={handleBack}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <CameraWizardDialog
        open={showWizard}
        onClose={() => setShowWizard(false)}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("cameraManagement.streams.deleteDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("cameraManagement.streams.deleteDialog.desc", {
                name: cameraToDelete ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("button.cancel", { ns: "common" })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t("cameraManagement.streams.deleteDialog.deleting") : t("cameraManagement.streams.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type CameraEnableSwitchProps = {
  cameraName: string;
};

function CameraEnableSwitch({ cameraName }: CameraEnableSwitchProps) {
  const { payload: enabledState, send: sendEnabled } =
    useEnabledState(cameraName);

  return (
    <div className="flex flex-row items-center">
      <Switch
        id={`camera-enabled-${cameraName}`}
        checked={enabledState === "ON"}
        onCheckedChange={(isChecked) => {
          sendEnabled(isChecked ? "ON" : "OFF");
        }}
      />
    </div>
  );
}
