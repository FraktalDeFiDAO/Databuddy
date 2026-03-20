"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ThemeTogglerProps {
	className?: string;
}

export function ThemeToggle({ className }: ThemeTogglerProps) {
	const { theme, setTheme } = useTheme();
	const currentTheme = theme ?? "system";

	const switchTheme = () => {
		const nextTheme =
			currentTheme === "system"
				? "light"
				: currentTheme === "light"
					? "dark"
					: "system";

		if (!("startViewTransition" in document)) {
			setTheme(nextTheme);
			return;
		}

		document.startViewTransition(() => {
			setTheme(nextTheme);
		});
	};

	const getThemeLabel = () => {
		switch (currentTheme) {
			case "light":
				return "Light mode";
			case "dark":
				return "Dark mode";
			case "system":
				return "System theme";
			default:
				return "Toggle theme";
		}
	};

	const getNextThemeLabel = () => {
		const nextTheme =
			currentTheme === "system"
				? "light"
				: currentTheme === "light"
					? "dark"
					: "system";
		switch (nextTheme) {
			case "light":
				return "Switch to light";
			case "dark":
				return "Switch to dark";
			case "system":
				return "Switch to system";
			default:
				return "Toggle theme";
		}
	};

	return (
		<Tooltip delayDuration={500}>
			<TooltipTrigger asChild>
				<Button
					aria-label="Toggle theme"
					className={cn(
						"relative size-7 transition-all duration-200",
						className
					)}
					onClick={switchTheme}
					suppressHydrationWarning
					type="button"
					variant="ghost"
				>
					<SunIcon
						className={cn(
							"size-4 transition-all duration-200",
							currentTheme === "light"
								? "rotate-0 scale-100"
								: "-rotate-90 scale-0"
						)}
						suppressHydrationWarning
						weight="duotone"
					/>
					<MoonIcon
						className={cn(
							"absolute size-4 transition-all duration-200",
							currentTheme === "dark"
								? "rotate-0 scale-100"
								: "rotate-90 scale-0"
						)}
						suppressHydrationWarning
						weight="duotone"
					/>
					<MonitorIcon
						className={cn(
							"absolute size-4 transition-all duration-200",
							currentTheme === "system"
								? "rotate-0 scale-100"
								: "rotate-90 scale-0"
						)}
						suppressHydrationWarning
						weight="duotone"
					/>
					<span className="sr-only">Toggle theme</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="right" sideOffset={8}>
				{getThemeLabel()} • {getNextThemeLabel()}
			</TooltipContent>
		</Tooltip>
	);
}
