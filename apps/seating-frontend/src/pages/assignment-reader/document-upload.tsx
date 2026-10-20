import { getRouteApi } from '@tanstack/react-router';
import type { DocumentType } from '@classprints/assignment-reader-shared';
import { asDocumentType } from '../../lib/assignment-reader-search';
import { UploadFlow } from '../../components/assignment-reader/upload-flow';

export function DocumentUploadPage({
  classId,
  assignmentId,
  documentType,
  documentId,
}: {
  classId: string;
  assignmentId: string;
  documentType: DocumentType;
  documentId: string;
}) {
  return (
    <UploadFlow
      classId={classId}
      assignmentId={assignmentId}
      documentType={documentType}
      documentId={documentId}
    />
  );
}

const documentUploadRouteApi = getRouteApi('/_app/classes/$classId/assignments/$assignmentId/documents/$documentType/$documentId/upload');

export function DocumentUploadRoute() {
  const { classId, assignmentId, documentType, documentId } = documentUploadRouteApi.useParams();
  return (
    <DocumentUploadPage
      classId={classId}
      assignmentId={assignmentId}
      documentType={asDocumentType(documentType)}
      documentId={documentId}
    />
  );
}
