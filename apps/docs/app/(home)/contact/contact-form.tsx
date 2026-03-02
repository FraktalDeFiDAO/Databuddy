"use client";

import { PaperPlaneIcon, SpinnerIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SciFiButton } from "@/components/landing/scifi-btn";
import { SciFiCard } from "@/components/scifi-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ContactData {
	fullName: string;
	businessName: string;
	email: string;
	phone: string;
}

const initialFormData: ContactData = {
	fullName: "",
	businessName: "",
	email: "",
	phone: "",
};

function FormField({
	label,
	required = false,
	children,
	description,
	error,
}: {
	label: string;
	required?: boolean;
	children: React.ReactNode;
	description?: string;
	error?: string;
}) {
	return (
		<div className="space-y-1.5">
			<Label className="text-foreground text-sm">
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</Label>
			{children}
			{error && <p className="text-destructive text-xs">{error}</p>}
			{description && !error && (
				<p className="text-muted-foreground text-xs">{description}</p>
			)}
		</div>
	);
}

export default function ContactForm() {
	const router = useRouter();
	const [formData, setFormData] = useState<ContactData>(initialFormData);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [errors, setErrors] = useState<
		Partial<Record<keyof ContactData, string>>
	>({});

	const validateForm = (): boolean => {
		const newErrors: Partial<Record<keyof ContactData, string>> = {};

		if (!formData.fullName.trim()) {
			newErrors.fullName = "Full name is required";
		} else if (formData.fullName.trim().length < 2) {
			newErrors.fullName = "Name must be at least 2 characters";
		}

		if (!formData.businessName.trim()) {
			newErrors.businessName = "Business or website name is required";
		} else if (formData.businessName.trim().length < 2) {
			newErrors.businessName = "Must be at least 2 characters";
		}

		if (!formData.email.trim()) {
			newErrors.email = "Email is required";
		} else if (
			!(formData.email.includes("@") && formData.email.includes("."))
		) {
			newErrors.email = "Please enter a valid email address";
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));

		if (errors[name as keyof ContactData]) {
			setErrors((prev) => ({ ...prev, [name]: undefined }));
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!validateForm()) {
			toast.error("Please fix the validation errors before submitting.");
			return;
		}

		setIsSubmitting(true);

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 30_000);

			const response = await fetch("/api/contact/submit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(formData),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			let data: Record<string, unknown>;
			try {
				data = (await response.json()) as Record<string, unknown>;
			} catch {
				throw new Error("Invalid response from server. Please try again.");
			}

			if (!response.ok) {
				if (response.status === 429) {
					const resetTime = data.resetTime
						? new Date(String(data.resetTime)).toLocaleTimeString()
						: "soon";
					throw new Error(
						`Too many submissions. Please try again after ${resetTime}.`
					);
				}

				if (response.status === 400 && data.details) {
					const errorMessage = Array.isArray(data.details)
						? (data.details as string[]).join("\n• ")
						: String(data.error || "Validation failed");
					throw new Error(
						`Please fix the following issues:\n• ${errorMessage}`
					);
				}

				throw new Error(
					String(data.error || "Submission failed. Please try again.")
				);
			}

			toast.success("Message sent!", {
				description: "We'll get back to you as soon as possible.",
				duration: 5000,
			});
			router.push("/contact/thanks");
		} catch (error) {
			if (error instanceof Error) {
				if (error.name === "AbortError") {
					toast.error(
						"Request timed out. Please check your connection and try again."
					);
				} else {
					const errorLines = error.message.split("\n");
					if (errorLines.length > 1) {
						toast.error(errorLines[0], {
							description: errorLines.slice(1).join("\n"),
							duration: 5000,
						});
					} else {
						toast.error(error.message);
					}
				}
			} else {
				toast.error("Failed to submit. Please try again.");
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<SciFiCard className="rounded border border-border bg-card/50 p-5 backdrop-blur-sm sm:p-6">
			<form className="space-y-4" onSubmit={handleSubmit}>
				<FormField error={errors.fullName} label="Full Name" required>
					<Input
						aria-invalid={!!errors.fullName}
						className={errors.fullName ? "border-destructive" : ""}
						maxLength={100}
						name="fullName"
						onChange={handleInputChange}
						placeholder="Jane Doe"
						required
						type="text"
						value={formData.fullName}
					/>
				</FormField>

				<FormField
					error={errors.businessName}
					label="Business or Website Name"
					required
				>
					<Input
						aria-invalid={!!errors.businessName}
						className={errors.businessName ? "border-destructive" : ""}
						maxLength={200}
						name="businessName"
						onChange={handleInputChange}
						placeholder="Acme Inc. or acme.com"
						required
						type="text"
						value={formData.businessName}
					/>
				</FormField>

				<FormField error={errors.email} label="Contact Email" required>
					<Input
						aria-invalid={!!errors.email}
						className={errors.email ? "border-destructive" : ""}
						maxLength={255}
						name="email"
						onChange={handleInputChange}
						placeholder="jane@acme.com"
						required
						type="email"
						value={formData.email}
					/>
				</FormField>

				<FormField
					description="Optional — we'll only call if needed"
					label="Phone Number"
				>
					<Input
						maxLength={30}
						name="phone"
						onChange={handleInputChange}
						placeholder="+1 (555) 123-4567"
						type="tel"
						value={formData.phone}
					/>
				</FormField>

				<div className="pt-2">
					<SciFiButton
						aria-label={isSubmitting ? "Sending message" : "Send message"}
						className="w-full"
						disabled={isSubmitting}
						type="submit"
					>
						{isSubmitting ? (
							<>
								<SpinnerIcon className="size-4 animate-spin" />
								Sending...
							</>
						) : (
							<>
								<PaperPlaneIcon className="size-4" weight="duotone" />
								Send Message
							</>
						)}
					</SciFiButton>
				</div>
			</form>
		</SciFiCard>
	);
}
