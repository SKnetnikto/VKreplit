import { useEffect } from "react";
import { useGetBotSettings, useUpdateBotSettings, getGetBotSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";

const settingsSchema = z.object({
  communityName: z.string().min(1, "Имя сообщества обязательно"),
  welcomeMessage: z.string().min(1, "Приветственное сообщение обязательно"),
  unknownCommandMessage: z.string().min(1, "Сообщение для неизвестной команды обязательно"),
  commandPrefix: z.string(),
  isActive: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { data: settings, isLoading } = useGetBotSettings();
  const updateSettings = useUpdateBotSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      communityName: "",
      welcomeMessage: "",
      unknownCommandMessage: "",
      commandPrefix: "/",
      isActive: false,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        communityName: settings.communityName,
        welcomeMessage: settings.welcomeMessage,
        unknownCommandMessage: settings.unknownCommandMessage,
        commandPrefix: settings.commandPrefix,
        isActive: settings.isActive,
      });
    }
  }, [settings, form]);

  const onSubmit = (values: SettingsFormValues) => {
    updateSettings.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetBotSettingsQueryKey() });
          toast({ title: "Настройки сохранены" });
        },
        onError: () => {
          toast({ title: "Ошибка при сохранении настроек", variant: "destructive" });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-[200px]" />
          <Skeleton className="h-4 w-[300px] mt-2" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[150px]" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Настройки</h1>
        <p className="text-muted-foreground mt-2">Основные параметры работы бота в сообществе.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Статус бота</CardTitle>
              <CardDescription>Включение и выключение обработки сообщений ботом.</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Включить бота</FormLabel>
                      <FormDescription>
                        Если выключено, бот будет игнорировать все входящие сообщения.
                      </FormDescription>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Основные настройки</CardTitle>
              <CardDescription>Настройка текстов и параметров бота.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="communityName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Имя сообщества</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="commandPrefix"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Префикс команд</FormLabel>
                    <FormControl>
                      <Input {...field} className="font-mono" />
                    </FormControl>
                    <FormDescription>Символ, с которого начинаются команды (например, / или !)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="welcomeMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Приветственное сообщение</FormLabel>
                    <FormControl>
                      <Textarea {...field} className="min-h-[100px] resize-y" />
                    </FormControl>
                    <FormDescription>Отправляется при первом обращении пользователя к боту</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unknownCommandMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Сообщение для неизвестной команды</FormLabel>
                    <FormControl>
                      <Textarea {...field} className="min-h-[100px] resize-y" />
                    </FormControl>
                    <FormDescription>Отправляется, если бот не нашел совпадений по команде</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="bg-muted/50 py-4 border-t">
              <Button type="submit" disabled={updateSettings.isPending} className="ml-auto">
                {updateSettings.isPending ? "Сохранение..." : "Сохранить изменения"}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
