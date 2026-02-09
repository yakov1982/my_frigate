import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import axios from "axios";
import {
  AddPlateRequest,
  LicensePlateEvent,
  LicensePlateListEntry,
  LicensePlateListType,
  UpdatePlateRequest,
} from "@/types/licensePlate";
import { FaPlus, FaEdit, FaTrash, FaSearch } from "react-icons/fa";
import useSWR from "swr";

export function LicensePlateManagementView() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPlate, setSelectedPlate] = useState<LicensePlateListEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"whitelist" | "blacklist" | "events">("whitelist");

  // Form state
  const [formData, setFormData] = useState<AddPlateRequest>({
    plate: "",
    list_type: "whitelist",
    camera: "",
    description: "",
  });

  // Fetch whitelist
  const { data: whitelistData, mutate: mutateWhitelist } = useSWR<LicensePlateListEntry[]>(
    "/api/lpr/plates?list_type=whitelist",
    (url: string) => axios.get(url).then((res) => res.data)
  );

  // Fetch blacklist
  const { data: blacklistData, mutate: mutateBlacklist } = useSWR<LicensePlateListEntry[]>(
    "/api/lpr/plates?list_type=blacklist",
    (url: string) => axios.get(url).then((res) => res.data)
  );

  // Fetch recent events
  const { data: eventsData, mutate: mutateEvents } = useSWR<LicensePlateEvent[]>(
    "/api/lpr/events?limit=100",
    (url: string) => axios.get(url).then((res) => res.data)
  );

  const whitelist = useMemo(() => whitelistData || [], [whitelistData]);
  const blacklist = useMemo(() => blacklistData || [], [blacklistData]);
  const events = useMemo(() => eventsData || [], [eventsData]);

  const filteredWhitelist = useMemo(() => {
    if (!searchQuery) return whitelist;
    return whitelist.filter(
      (plate) =>
        plate.plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plate.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [whitelist, searchQuery]);

  const filteredBlacklist = useMemo(() => {
    if (!searchQuery) return blacklist;
    return blacklist.filter(
      (plate) =>
        plate.plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plate.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [blacklist, searchQuery]);

  const filteredEvents = useMemo(() => {
    if (!searchQuery) return events;
    return events.filter(
      (event) =>
        event.plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.camera.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [events, searchQuery]);

  const handleAddPlate = useCallback(async () => {
    if (!formData.plate) {
      toast.error("License plate number is required");
      return;
    }

    try {
      await axios.post("/api/lpr/plates", formData);
      toast.success(`Successfully added ${formData.plate} to ${formData.list_type}`);
      setIsAddDialogOpen(false);
      setFormData({
        plate: "",
        list_type: "whitelist",
        camera: "",
        description: "",
      });
      mutateWhitelist();
      mutateBlacklist();
    } catch (error) {
      toast.error("Failed to add license plate");
      console.error(error);
    }
  }, [formData, mutateWhitelist, mutateBlacklist]);

  const handleUpdatePlate = useCallback(async () => {
    if (!selectedPlate) return;

    try {
      const updateData: UpdatePlateRequest = {
        plate: formData.plate,
        list_type: formData.list_type,
        camera: formData.camera || undefined,
        description: formData.description || undefined,
      };

      await axios.put(`/api/lpr/plates/${selectedPlate.id}`, updateData);
      toast.success("Successfully updated license plate");
      setIsEditDialogOpen(false);
      setSelectedPlate(null);
      mutateWhitelist();
      mutateBlacklist();
    } catch (error) {
      toast.error("Failed to update license plate");
      console.error(error);
    }
  }, [selectedPlate, formData, mutateWhitelist, mutateBlacklist]);

  const handleDeletePlate = useCallback(
    async (plate: LicensePlateListEntry) => {
      if (!confirm(`Are you sure you want to delete ${plate.plate}?`)) return;

      try {
        await axios.delete(`/api/lpr/plates/${plate.id}`);
        toast.success("Successfully deleted license plate");
        mutateWhitelist();
        mutateBlacklist();
      } catch (error) {
        toast.error("Failed to delete license plate");
        console.error(error);
      }
    },
    [mutateWhitelist, mutateBlacklist]
  );

  const openEditDialog = useCallback((plate: LicensePlateListEntry) => {
    setSelectedPlate(plate);
    setFormData({
      plate: plate.plate,
      list_type: plate.list_type,
      camera: plate.camera || "",
      description: plate.description || "",
    });
    setIsEditDialogOpen(true);
  }, []);

  const getListStatusBadge = (status: LicensePlateListType | null) => {
    if (status === "whitelist") {
      return <Badge className="bg-green-500">Whitelist</Badge>;
    } else if (status === "blacklist") {
      return <Badge className="bg-red-500">Blacklist</Badge>;
    }
    return <Badge variant="secondary">Unknown</Badge>;
  };

  return (
    <div className="size-full p-4">
      <Card>
        <CardHeader>
          <CardTitle>License Plate Management</CardTitle>
          <CardDescription>
            Manage whitelist and blacklist for automatic license plate recognition
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search license plates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <FaPlus className="mr-2" />
              Add Plate
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="whitelist">
                Whitelist ({whitelist.length})
              </TabsTrigger>
              <TabsTrigger value="blacklist">
                Blacklist ({blacklist.length})
              </TabsTrigger>
              <TabsTrigger value="events">
                Recent Detections ({events.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="whitelist">
              <PlateListTable
                plates={filteredWhitelist}
                onEdit={openEditDialog}
                onDelete={handleDeletePlate}
              />
            </TabsContent>

            <TabsContent value="blacklist">
              <PlateListTable
                plates={filteredBlacklist}
                onEdit={openEditDialog}
                onDelete={handleDeletePlate}
              />
            </TabsContent>

            <TabsContent value="events">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plate</TableHead>
                    <TableHead>Camera</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Detected At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No events found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-mono font-semibold">{event.plate}</TableCell>
                        <TableCell>{event.camera}</TableCell>
                        <TableCell>{getListStatusBadge(event.list_status)}</TableCell>
                        <TableCell>{(event.confidence * 100).toFixed(1)}%</TableCell>
                        <TableCell>
                          {new Date(event.detected_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add License Plate</DialogTitle>
            <DialogDescription>
              Add a new license plate to the whitelist or blacklist
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="plate">License Plate Number *</Label>
              <Input
                id="plate"
                placeholder="ABC123"
                value={formData.plate}
                onChange={(e) => setFormData({ ...formData, plate: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="list_type">List Type *</Label>
              <Select
                value={formData.list_type}
                onValueChange={(value: LicensePlateListType) =>
                  setFormData({ ...formData, list_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whitelist">Whitelist</SelectItem>
                  <SelectItem value="blacklist">Blacklist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="camera">Camera (Optional)</Label>
              <Input
                id="camera"
                placeholder="Leave empty for all cameras"
                value={formData.camera}
                onChange={(e) => setFormData({ ...formData, camera: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                placeholder="e.g., Owner's vehicle"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddPlate}>Add Plate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit License Plate</DialogTitle>
            <DialogDescription>Update license plate information</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-plate">License Plate Number *</Label>
              <Input
                id="edit-plate"
                placeholder="ABC123"
                value={formData.plate}
                onChange={(e) => setFormData({ ...formData, plate: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-list_type">List Type *</Label>
              <Select
                value={formData.list_type}
                onValueChange={(value: LicensePlateListType) =>
                  setFormData({ ...formData, list_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whitelist">Whitelist</SelectItem>
                  <SelectItem value="blacklist">Blacklist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-camera">Camera (Optional)</Label>
              <Input
                id="edit-camera"
                placeholder="Leave empty for all cameras"
                value={formData.camera}
                onChange={(e) => setFormData({ ...formData, camera: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description (Optional)</Label>
              <Input
                id="edit-description"
                placeholder="e.g., Owner's vehicle"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePlate}>Update Plate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper component for the plate list table
function PlateListTable({
  plates,
  onEdit,
  onDelete,
}: {
  plates: LicensePlateListEntry[];
  onEdit: (plate: LicensePlateListEntry) => void;
  onDelete: (plate: LicensePlateListEntry) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Plate</TableHead>
          <TableHead>Camera</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {plates.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No plates found
            </TableCell>
          </TableRow>
        ) : (
          plates.map((plate) => (
            <TableRow key={plate.id}>
              <TableCell className="font-mono font-semibold">{plate.plate}</TableCell>
              <TableCell>{plate.camera || "All cameras"}</TableCell>
              <TableCell>{plate.description || "-"}</TableCell>
              <TableCell>{new Date(plate.created_at).toLocaleDateString()}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(plate)}>
                    <FaEdit />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(plate)}>
                    <FaTrash className="text-red-500" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
