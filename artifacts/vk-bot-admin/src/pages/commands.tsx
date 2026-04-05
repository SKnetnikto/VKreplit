import { useState, useEffect } from "react";
import { useListCommands, useCreateCommand, useUpdateCommand, useDeleteCommand, getListCommandsQueryKey, useGetCommand, getGetCommandQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";

const commandSchema = z.object({
  trigger: z.string().min(1, "Триггер обязателен"),
  response: z.string().min(1, "Ответ обязателен"),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

type CommandFormValues = z.infer<typeof commandSchema>;

export default function Commands() {
  const { data: commands, isLoading } = useListCommands();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCommandId, setEditingCommandId] = useState<number | null>(null);
  const [deletingCommand, setDeletingCommand] = useState<any>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createCommand = useCreateCommand();
  const updateCommand = useUpdateCommand();
  const deleteCommand = useDeleteCommand();

  const { data: editingCommandData, isLoading: isEditingLoading } = useGetCommand(
    editingCommandId as number,
    { query: { enabled: !!editingCommandId, queryKey: getGetCommandQueryKey(editingCommandId as number) } }
  );

  const form = useForm<CommandFormValues>({
    resolver: zodResolver(commandSchema),
    defaultValues: {
      trigger: "",
      response: "",
      description: "",
      isActive: true,
    },
  });

  useEffect(() => {
    if (editingCommandData) {
      form.reset({
        trigger: editingCommandData.trigger,
        response: editingCommandData.response,
        description: editingCommandData.description || "",
        isActive: editingCommandData.isActive,
      });
    }
  }, [editingCommandData, form]);

  const onOpenCreate = () => {
    form.reset({ trigger: "", response: "", description: "", isActive: true });
    setIsCreateOpen(true);
  };

  const onOpenEdit = (id: number) => {
    setEditingCommandId(id);
  };

  const handleSave = (values: CommandFormValues) => {
    if (editingCommandId) {
      updateCommand.mutate(
        { id: editingCommandId, data: values },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListCommandsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetCommandQueryKey(editingCommandId) });
            setEditingCommandId(null);
            toast({ title: "Команда обновлена" });
          },
        }
      );
    } else {
      createCommand.mutate(
        { data: values },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListCommandsQueryKey() });
            setIsCreateOpen(false);
            toast({ title: "Команда создана" });
          },
        }
      );
    }
  };

  const handleToggleActive = (id: number, isActive: boolean) => {
    updateCommand.mutate(
      { id, data: { isActive } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCommandsQueryKey() });
          toast({ title: isActive ? "Команда включена" : "Команда выключена" });
        },
      }
    );
  };

  const handleDelete = () => {
    if (!deletingCommand) return;
    deleteCommand.mutate(
      { id: deletingCommand.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCommandsQueryKey() });
          setDeletingCommand(null);
          toast({ title: "Команда удалена" });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Команды</h1>
          <p className="text-muted-foreground mt-2">Управление командами, на которые реагирует бот.</p>
        </div>
        <Button onClick={onOpenCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить команду
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Триггер</TableHead>
              <TableHead>Ответ</TableHead>
              <TableHead>Использования</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[50px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[50px]" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-8 inline-block ml-2" /></TableCell>
                </TableRow>
              ))
            ) : commands?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Нет созданных команд
                </TableCell>
              </TableRow>
            ) : (
              commands?.map((cmd) => (
                <TableRow key={cmd.id}>
                  <TableCell className="font-medium font-mono bg-muted/30 p-2 rounded">
                    {cmd.trigger}
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate" title={cmd.response}>
                    {cmd.response}
                  </TableCell>
                  <TableCell>{cmd.usageCount}</TableCell>
                  <TableCell>
                    <Switch
                      checked={cmd.isActive}
                      onCheckedChange={(checked) => handleToggleActive(cmd.id, checked)}
                      disabled={updateCommand.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => onOpenEdit(cmd)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeletingCommand(cmd)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isCreateOpen || !!editingCommand} onOpenChange={(open) => {
        if (!open) {
          setIsCreateOpen(false);
          setEditingCommand(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCommand ? "Редактировать команду" : "Новая команда"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
              <FormField
                control={form.control}
                name="trigger"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Триггер</FormLabel>
                    <FormControl>
                      <Input placeholder="Например: привет" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="response"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ответ бота</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Например: Привет! Как дела?" className="resize-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Описание (опционально)</FormLabel>
                    <FormControl>
                      <Input placeholder="Для чего нужна команда" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Активна</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setIsCreateOpen(false); setEditingCommand(null); }}>
                  Отмена
                </Button>
                <Button type="submit" disabled={createCommand.isPending || updateCommand.isPending}>
                  Сохранить
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingCommand} onOpenChange={(open) => !open && setDeletingCommand(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить команду?</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить команду "{deletingCommand?.trigger}"? Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingCommand(null)}>Отмена</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteCommand.isPending}>
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
