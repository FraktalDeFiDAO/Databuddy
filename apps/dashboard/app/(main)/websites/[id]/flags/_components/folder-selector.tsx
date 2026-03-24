"use client";

import { Folder, FolderOpen } from "@phosphor-icons/react/dist/ssr";
import { CheckIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface FolderOption {
	value: string;
	label: string;
	disabled?: boolean;
}

interface FolderSelectorProps {
	value?: string | null;
	onChange: (folder: string | null) => void;
	availableFolders?: string[];
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	onCreateFolder?: (folder: string) => void;
}

export function FolderSelector({
	value,
	onChange,
	availableFolders = [],
	placeholder = "Select folder...",
	className,
	disabled,
	onCreateFolder,
}: FolderSelectorProps) {
	const [open, setOpen] = useState(false);
	const [searchValue, setSearchValue] = useState("");

	// Extract unique folders and build hierarchy
	const folderOptions = useMemo(() => {
		const folders = new Set<string>();

		// Add existing folders
		for (const folder of availableFolders) {
			if (folder) {
				folders.add(folder);
			}
		}

		// Add current value if not in list
		if (value && !folders.has(value)) {
			folders.add(value);
		}

		// Convert to options with hierarchy display
		const options: FolderOption[] = Array.from(folders)
			.sort()
			.map((folder) => ({
				value: folder,
				label: folder,
			}));

		return options;
	}, [availableFolders, value]);

	// Filter folders based on search
	const filteredOptions = useMemo(() => {
		if (!searchValue.trim()) {
			return folderOptions;
		}
		return folderOptions.filter((option) =>
			option.label.toLowerCase().includes(searchValue.toLowerCase())
		);
	}, [folderOptions, searchValue]);

	// Get parent folders for display
	const getFolderDisplay = (folder: string) => {
		const parts = folder.split("/");
		if (parts.length === 1) {
			return folder;
		}
		return parts.join(" / ");
	};

	const handleSelect = (folderValue: string) => {
		onChange(folderValue === value ? null : folderValue);
		setOpen(false);
	};

	const handleCreateFolder = () => {
		if (searchValue.trim() && onCreateFolder) {
			onCreateFolder(searchValue.trim());
			setSearchValue("");
		}
	};

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-expanded={open}
					className={cn("w-full justify-between", className)}
					disabled={disabled}
					role="combobox"
					variant="outline"
				>
					<span className={cn("truncate", !value && "text-muted-foreground")}>
						{value ? (
							<div className="flex items-center gap-2">
								<Folder className="size-4" weight="duotone" />
								{getFolderDisplay(value)}
							</div>
						) : (
							placeholder
						)}
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[300px] p-0">
				<Command shouldFilter={true}>
					<CommandInput
						onValueChange={setSearchValue}
						placeholder="Search folders..."
						value={searchValue}
					/>
					<CommandList>
						<CommandEmpty>
							{searchValue.trim() && onCreateFolder ? (
								<div className="flex items-center justify-between py-2">
									<span className="text-muted-foreground text-sm">
										No folder found. Create one?
									</span>
									<Button
										className="h-7 px-2"
										onClick={handleCreateFolder}
										size="sm"
										variant="ghost"
									>
										<PlusIcon className="mr-1 size-3" />
										Create
									</Button>
								</div>
							) : (
								"No folders found."
							)}
						</CommandEmpty>
						<CommandGroup>
							{/* No Folder Option */}
							<CommandItem
								onSelect={() => onChange(null)}
								value="__no_folder__"
							>
								<CheckIcon
									className={cn(
										"mr-2 size-4",
										value ? "opacity-0" : "opacity-100"
									)}
								/>
								<span>No folder (root)</span>
							</CommandItem>

							{/* Existing Folders */}
							{filteredOptions.map((option) => (
								<CommandItem
									key={option.value}
									onSelect={() => handleSelect(option.value)}
									value={option.value}
								>
									<CheckIcon
										className={cn(
											"mr-2 size-4",
											value === option.value ? "opacity-100" : "opacity-0"
										)}
									/>
									<FolderOpen
										className="mr-2 size-4 text-muted-foreground"
										weight="duotone"
									/>
									<span className="truncate">
										{getFolderDisplay(option.value)}
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
