import type { PrismaClient } from '@prisma/client';

// 단지 커뮤니티 — 게시글(Post) + 댓글(Comment). complexName 단위 폐쇄형.

export type PostInput = {
  complexName: string;
  authorId: string;
  title: string;
  body: string;
};

export type PostRecord = {
  id: string;
  complexName: string;
  authorId: string;
  title: string;
  body: string;
  createdAt: Date;
};

export type CommentInput = {
  postId: string;
  authorId: string;
  body: string;
};

export type CommentRecord = {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: Date;
};

export interface CommunityRepository {
  createPost(input: PostInput): Promise<PostRecord>;
  getPost(id: string): Promise<PostRecord | null>;
  listPosts(complexName: string): Promise<PostRecord[]>;
  addComment(input: CommentInput): Promise<CommentRecord>;
  listComments(postId: string): Promise<CommentRecord[]>;
}

function nextPostId(): string {
  return `post_${Math.random().toString(36).slice(2, 11)}`;
}
function nextCommentId(): string {
  return `cmt_${Math.random().toString(36).slice(2, 11)}`;
}

// === In-memory ===

export function makeInMemoryCommunityRepository(): CommunityRepository {
  const posts = new Map<string, PostRecord>();
  const comments: CommentRecord[] = [];
  return {
    async createPost(input) {
      const rec: PostRecord = {
        id: nextPostId(),
        complexName: input.complexName,
        authorId: input.authorId,
        title: input.title,
        body: input.body,
        createdAt: new Date(),
      };
      posts.set(rec.id, rec);
      return rec;
    },
    async getPost(id) {
      return posts.get(id) ?? null;
    },
    async listPosts(complexName) {
      return [...posts.values()]
        .filter((p) => p.complexName === complexName)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async addComment(input) {
      const rec: CommentRecord = {
        id: nextCommentId(),
        postId: input.postId,
        authorId: input.authorId,
        body: input.body,
        createdAt: new Date(),
      };
      comments.push(rec);
      return rec;
    },
    async listComments(postId) {
      return comments
        .filter((c) => c.postId === postId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
  };
}

// === Prisma ===

export function makePrismaCommunityRepository(
  prisma: PrismaClient
): CommunityRepository {
  return {
    async createPost(input) {
      const rec = await prisma.communityPost.create({
        data: {
          id: nextPostId(),
          complexName: input.complexName,
          authorId: input.authorId,
          title: input.title,
          body: input.body,
        },
      });
      return rec as PostRecord;
    },
    async getPost(id) {
      const rec = await prisma.communityPost.findUnique({ where: { id } });
      return (rec as PostRecord | null) ?? null;
    },
    async listPosts(complexName) {
      const list = await prisma.communityPost.findMany({
        where: { complexName },
        orderBy: { createdAt: 'desc' },
      });
      return list as PostRecord[];
    },
    async addComment(input) {
      const rec = await prisma.postComment.create({
        data: {
          id: nextCommentId(),
          postId: input.postId,
          authorId: input.authorId,
          body: input.body,
        },
      });
      return rec as CommentRecord;
    },
    async listComments(postId) {
      const list = await prisma.postComment.findMany({
        where: { postId },
        orderBy: { createdAt: 'asc' },
      });
      return list as CommentRecord[];
    },
  };
}
