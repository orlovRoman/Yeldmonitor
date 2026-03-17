import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, Send, CheckCircle2, RefreshCw, AlertCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type UserSettings = {
  id: string;
  telegram_chat_id: number | null;
  telegram_username: string | null;
  connection_code: string;
  implied_apy_threshold_percent: number;
  underlying_apy_threshold_percent: number;
  platforms: string[];
  is_active: boolean;
  notify_implied_increase: boolean;
};

const PLATFORMS_LIST = ["Pendle", "Spectra", "Exponent", "RateX"];

export function TelegramSettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [localCode, setLocalCode] = useState<string | null>(null);
  const { toast } = useToast();

  // Try to load settings from localStorage code first
  useEffect(() => {
    if (isOpen) {
      const code = localStorage.getItem("telegram_connection_code");
      if (code) {
        setLocalCode(code);
        fetchSettings(code);
      }
    }
  }, [isOpen]);

  // Poll for connection status if code exists but not connected yet
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isOpen && settings && !settings.telegram_chat_id && settings.connection_code) {
      interval = setInterval(() => {
        fetchSettings(settings.connection_code);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isOpen, settings]);


  const fetchSettings = async (code: string) => {
    const { data, error } = await supabase
      .from("user_telegram_settings" as any)
      .select("*")
      .eq("connection_code", code)
      .single();

    if (data) {
      setSettings((data as unknown) as UserSettings);
    }
  };

  const handleGenerateCode = async () => {
    setLoading(true);
    const newCode = `YM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    const { data, error } = await supabase
      .from("user_telegram_settings" as any)
      .insert({
        connection_code: newCode,
        implied_apy_threshold_percent: 1.0,
        underlying_apy_threshold_percent: 1.0,
        platforms: PLATFORMS_LIST,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось сгенерировать код. Попробуйте позже.",
        variant: "destructive",
      });
    } else if (data) {
      localStorage.setItem("telegram_connection_code", newCode);
      setLocalCode(newCode);
      setSettings((data as unknown) as UserSettings);
    }
    setLoading(false);
  };

  const handleUpdateSettings = async (updates: Partial<UserSettings>) => {
    if (!settings) return;
    
    // Optimistic update
    setSettings(prev => prev ? { ...prev, ...updates } : null);

    const { error } = await supabase
      .from("user_telegram_settings" as any)
      .update(updates)
      .eq("id", settings.id);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить настройки",
        variant: "destructive",
      });
      // Revert on error
      fetchSettings(settings.connection_code);
    } else {
       toast({
        title: "Сохранено",
        description: "Настройки уведомлений обновлены",
      });
    }
  };

  const togglePlatform = (platform: string) => {
    if (!settings) return;
    const current = settings.platforms || [];
    const updated = current.includes(platform)
      ? current.filter(p => p !== platform)
      : [...current, platform];
      
    handleUpdateSettings({ platforms: updated });
  };

  const handleDeactivate = async () => {
      if (!settings) return;
      await handleUpdateSettings({ is_active: false });
      toast({ title: "Уведомления отключены" });
  };

  const handleDisconnect = async () => {
      if (!settings) return;
      // Delete from DB
      await supabase.from("user_telegram_settings" as any).delete().eq("id", settings.id);
      localStorage.removeItem("telegram_connection_code");
      setSettings(null);
      setLocalCode(null);
      toast({ title: "Аккаунт отвязан" });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden sm:flex gap-2 text-primary hover:text-primary border-primary/20 hover:border-primary">
          <Send className="w-4 h-4" />
          <span className="font-medium">Telegram Alerts</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Telegram Уведомления
          </DialogTitle>
          <DialogDescription>
            Получайте мгновенные уведомления о резких изменениях APY прямо в Telegram.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-6">
          {!settings?.telegram_chat_id ? (
            <div className="flex flex-col items-center justify-center p-6 text-center border rounded-xl bg-muted/20">
              {settings?.connection_code ? (
                <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
                    <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                  </div>
                  <h3 className="font-semibold text-lg">Ожидание привязки...</h3>
                  <p className="text-sm text-muted-foreground">
                    Отправьте этот код нашему боту <a href="https://t.me/YieldMonitor_Bot" target="_blank" rel="noreferrer" className="text-primary hover:underline">@YieldMonitor_Bot</a>
                  </p>
                  <div className="bg-background border px-4 py-3 rounded-lg font-mono text-xl tracking-wider select-all cursor-pointer">
                    /start {settings.connection_code}
                  </div>
                  <Button asChild className="w-full mt-2" variant="default">
                     <a href={`https://t.me/YieldMonitor_Bot?start=${settings.connection_code}`} target="_blank" rel="noreferrer">
                        Открыть в Telegram
                     </a>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
                    <Send className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg">Подключите аккаунт</h3>
                  <p className="text-sm text-muted-foreground">
                    Сгенерируйте уникальный код для привязки вашего Telegram аккаунта к YieldMonitor.
                  </p>
                  <Button onClick={handleGenerateCode} disabled={loading} className="w-full">
                    {loading ? "Генерация..." : "Узнать код привязки"}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between p-4 border rounded-xl bg-primary/5 border-primary/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Подключено как</p>
                    <p className="text-lg font-semibold text-primary">@{settings.telegram_username}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleDisconnect} className="text-destructive hover:bg-destructive/10">
                  Отвязать
                </Button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="flex flex-col gap-1">
                    <span className="font-semibold">Статус уведомлений</span>
                    <span className="text-xs text-muted-foreground">Временно приостановить отправку</span>
                  </Label>
                  <Switch 
                    checked={settings.is_active} 
                    onCheckedChange={(val) => handleUpdateSettings({ is_active: val })}
                  />
                </div>
                
                <div className="flex items-center justify-between pt-2">
                  <Label className="flex flex-col gap-1">
                    <span className="font-semibold">Уведомлять о росте Implied APY</span>
                    <span className="text-xs text-muted-foreground">Если выключено — только о падении</span>
                  </Label>
                  <Switch 
                    checked={settings.notify_implied_increase} 
                    onCheckedChange={(val) => handleUpdateSettings({ notify_implied_increase: val })}
                  />
                </div>
                
                <div className="space-y-3 pt-2">
                  <Label>Порог изменения Implied APY (%)</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                        type="number" 
                        step="0.1" 
                        min="0.1"
                        value={settings.implied_apy_threshold_percent}
                        onChange={(e) => handleUpdateSettings({ implied_apy_threshold_percent: parseFloat(e.target.value) || 1 })}
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Уведомление придет, если Implied APY изменится больше чем на это значение.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <Label>Платформы</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {PLATFORMS_LIST.map(platform => (
                       <label key={platform} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${(settings.platforms || []).includes(platform) ? 'bg-primary/5 border-primary/30' : ''}`}>
                         <Switch 
                            checked={(settings.platforms || []).includes(platform)}
                            onCheckedChange={() => togglePlatform(platform)}
                            className="scale-75"
                         />
                         <span className="text-sm font-medium">{platform}</span>
                       </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
