import type { DocumentType } from '@classprints/assignment-reader-shared';
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
