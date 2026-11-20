import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { BasePage } from "@/app/base-page";
import { getPostBySlug, getPosts } from "@/blog/posts";
import { formatDate } from "@/utils/date";
import { ChevronLeftIcon } from "lucide-react";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
	return getPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const post = getPostBySlug({ slug });
	if (!post) return {};
	return {
		title: `${post.title} - NeoImage Blog`,
		description: post.description,
		openGraph: {
			title: post.title,
			description: post.description,
			type: "article",
			publishedTime: post.publishedAt,
		},
	};
}

export default async function BlogPostPage({ params }: Props) {
	const { slug } = await params;
	const post = getPostBySlug({ slug });
	if (!post) notFound();

	return (
		<BasePage>
			<div className="flex flex-col gap-10">
				<Link
					href="/blog"
					className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
				>
					<ChevronLeftIcon className="size-4" />
					All posts
				</Link>
				<div className="flex flex-col gap-4">
					<span className="text-muted-foreground text-sm">
						{formatDate({ date: new Date(post.publishedAt) })} · {post.author}
					</span>
					<h1 className="text-4xl font-bold tracking-tight md:text-5xl">
						{post.title}
					</h1>
					<p className="text-muted-foreground text-lg">{post.description}</p>
				</div>
				<article className="prose dark:prose-invert prose-a:text-primary max-w-none">
					<ReactMarkdown>{post.content}</ReactMarkdown>
				</article>
			</div>
		</BasePage>
	);
}
