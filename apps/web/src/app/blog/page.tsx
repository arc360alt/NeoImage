import type { Metadata } from "next";
import Link from "next/link";
import { BasePage } from "@/app/base-page";
import { Separator } from "@/components/ui/separator";
import { getPosts, type Post } from "@/blog/posts";

export const metadata: Metadata = {
	title: "Blog - OpenImage",
	description:
		"Read the latest news and updates about OpenImage, the free and open-source photo editor.",
	openGraph: {
		title: "Blog - OpenImage",
		description:
			"Read the latest news and updates about OpenImage, the free and open-source photo editor.",
		type: "website",
	},
};

export default function BlogPage() {
	const posts = getPosts();

	return (
		<BasePage
			title="Blog"
			description="Read the latest news and updates about OpenImage, the free and open-source photo editor."
		>
			<div className="flex flex-col">
				{posts.map((post) => (
					<div key={post.slug} className="flex flex-col">
						<BlogPostItem post={post} />
						<Separator />
					</div>
				))}
			</div>
		</BasePage>
	);
}

function BlogPostItem({ post }: { post: Post }) {
	return (
		<Link href={`/blog/${post.slug}`}>
			<div className="flex h-auto w-full items-center justify-between py-6 opacity-100 hover:opacity-75">
				<div className="flex flex-col gap-2">
					<h2 className="text-xl font-semibold">{post.title}</h2>
					<p className="text-muted-foreground">{post.description}</p>
				</div>
			</div>
		</Link>
	);
}
