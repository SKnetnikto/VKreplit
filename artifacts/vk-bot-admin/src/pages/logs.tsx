import { useListMessageLogs } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Logs() {
  // In a real app, we'd use pagination state here. 
  // Currently API supports params?: { limit?: number } but not offset/page directly in the types.
  // We'll just fetch latest.
  const { data: logs, isLoading } = useListMessageLogs({ query: { queryKey: ["logs"] }, request: {} });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Логи сообщений</h1>
        <p className="text-muted-foreground mt-2">История входящих сообщений и ответов бота.</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Время</TableHead>
              <TableHead className="w-[120px]">Пользователь</TableHead>
              <TableHead className="w-[30%]">Сообщение</TableHead>
              <TableHead className="w-[150px]">Команда</TableHead>
              <TableHead>Ответ бота</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                </TableRow>
              ))
            ) : logs?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  Логи пусты
                </TableCell>
              </TableRow>
            ) : (
              logs?.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">
                    {log.userId}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={log.message}>
                    {log.message}
                  </TableCell>
                  <TableCell>
                    {log.commandTrigger ? (
                      <Badge variant="secondary" className="font-mono font-normal">
                        {log.commandTrigger}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={log.responseSent || ""}>
                    {log.responseSent ? (
                      <span className="text-sm">{log.responseSent}</span>
                    ) : (
                      <span className="text-muted-foreground text-sm italic">Нет ответа</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
