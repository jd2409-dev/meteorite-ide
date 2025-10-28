/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { EduStorageService, IEduStorageService, BrowserNotebookCache, IFirestoreClient, InMemoryFirestoreClient, OfflineError, ConflictError } from '../../common/services/storageService.js';

class BrowserEduStorageService extends EduStorageService {
    constructor() {
        super(createFirestoreClient(), new BrowserNotebookCache());
    }
}

function createFirestoreClient(): IFirestoreClient {
    const firebase = (globalThis as any)?.firebase;
    if (!firebase) {
        return new InMemoryFirestoreClient();
    }

    try {
        return new FirebaseFirestoreClient(firebase);
    } catch (error) {
        return new InMemoryFirestoreClient();
    }
}

class FirebaseFirestoreClient implements IFirestoreClient {
    private readonly firestore: any;

    constructor(firebase: any) {
        if (firebase.firestore) {
            this.firestore = firebase.firestore();
        } else if (firebase.app && firebase.app().firestore) {
            this.firestore = firebase.app().firestore();
        } else {
            throw new Error('Firestore not available');
        }
    }

    async getNotebook(userId: string, notebookId: string) {
        try {
            const doc = await this.notebookRef(userId, notebookId).get();
            return doc.exists ? doc.data() : undefined;
        } catch (error) {
            throw this.translateError(error);
        }
    }

    async saveNotebook(snapshot: any, options?: { expectedVersion?: number }) {
        try {
            return await this.firestore.runTransaction(async (tx: any) => {
                const ref = this.notebookRef(snapshot.userId, snapshot.notebookId);
                const current = await tx.get(ref);
                const currentVersion = current.exists ? current.data().version : undefined;
                if (options?.expectedVersion !== undefined && current.exists && currentVersion !== options.expectedVersion) {
                    throw new ConflictError();
                }
                tx.set(ref, snapshot, { merge: false });
                return snapshot;
            });
        } catch (error) {
            if (error instanceof ConflictError) {
                throw error;
            }
            throw this.translateError(error);
        }
    }

    async getLessonProgress(userId: string, lessonId: string) {
        try {
            const doc = await this.lessonRef(userId, lessonId).get();
            return doc.exists ? doc.data() : undefined;
        } catch (error) {
            throw this.translateError(error);
        }
    }

    async saveLessonProgress(progress: any) {
        try {
            await this.lessonRef(progress.userId, progress.lessonId).set(progress, { merge: true });
        } catch (error) {
            throw this.translateError(error);
        }
    }

    async getSession(userId: string) {
        try {
            const doc = await this.sessionRef(userId).get();
            return doc.exists ? doc.data() : undefined;
        } catch (error) {
            throw this.translateError(error);
        }
    }

    async saveSession(session: any) {
        try {
            await this.sessionRef(session.userId).set(session, { merge: true });
        } catch (error) {
            throw this.translateError(error);
        }
    }

    async deletePendingSnapshot(): Promise<void> {
        return;
    }

    private notebookRef(userId: string, notebookId: string) {
        return this.firestore.collection('users').doc(userId).collection('notebooks').doc(notebookId);
    }

    private lessonRef(userId: string, lessonId: string) {
        return this.firestore.collection('users').doc(userId).collection('lessonProgress').doc(lessonId);
    }

    private sessionRef(userId: string) {
        return this.firestore.collection('users').doc(userId).collection('sessions').doc('last');
    }

    private translateError(error: any): Error {
        const code = typeof error === 'object' ? error?.code : undefined;
        if (code === 'aborted' || code === 'unavailable' || code === 'failed-precondition') {
            return new OfflineError(String(error?.message ?? 'offline'));
        }
        return new Error(String(error?.message ?? error));
    }
}

registerSingleton(IEduStorageService, BrowserEduStorageService, InstantiationType.Delayed);
