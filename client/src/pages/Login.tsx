import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Music2, ArrowRight, Mail, Loader2, Headphones } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      toast.success("Добро пожаловать!");
      await utils.auth.me.invalidate();
      setLocation("/");
    },
    onError: (err) => {
      toast.error(`Ошибка: ${err.message}`);
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    loginMutation.mutate({ email: email.trim() });
  };

  const isLoading = loginMutation.isPending;
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-bl from-primary/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-to-tr from-primary/3 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10">
        {/* Logo */}
        <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Music2 className="w-8 h-8 text-primary-foreground" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
          <h1 className="text-2xl md:text-3xl font-semibold mb-2">
            Войти в SoundWave
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Миллионы треков ждут вас
          </p>
        </div>

        {/* Login form */}
        <form 
          onSubmit={handleLogin} 
          className="w-full max-w-sm space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200"
        >
          {/* Email input */}
          <div className="relative">
            <div className={`
              absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200
              ${isFocused ? 'text-primary' : 'text-muted-foreground'}
            `}>
              <Mail className="w-5 h-5" />
            </div>
            <Input
              type="email"
              placeholder="Ваш email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={isLoading}
              className={`
                h-14 pl-12 pr-4 text-base rounded-xl border-2 transition-all duration-200
                ${isFocused 
                  ? 'border-primary bg-background shadow-lg shadow-primary/5' 
                  : 'border-border bg-secondary/50 hover:border-border/80'
                }
              `}
              autoComplete="email"
              autoFocus
            />
          </div>

          {/* Submit button */}
          <Button 
            type="submit" 
            size="lg"
            disabled={isLoading || !isValidEmail}
            className="w-full h-14 text-base font-medium rounded-xl transition-all duration-200 group"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Вход...
              </>
            ) : (
              <>
                Продолжить
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </Button>

          {/* Hint */}
          <p className="text-center text-xs text-muted-foreground pt-2">
            Введите любой email для входа в демо-режиме
          </p>
        </form>
      </div>

      {/* Footer */}
      <footer className="py-6 px-6 text-center animate-in fade-in duration-500 delay-300">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Headphones className="w-4 h-4" />
          <span>Powered by SoundCloud</span>
        </div>
      </footer>
    </div>
  );
}
