import { OsdReceipt, OsdItemDetail } from '../types/inventory';

function normKey(raw: string | undefined | null): string {
  return (raw || '').trim().toUpperCase();
}

export type VersionVector = Record<string, number>;

export type VectorComparison = 'EQUAL' | 'DOMINATES' | 'DOMINATED' | 'CONCURRENT';

/**
 * So sánh hai version vector theo định lý quan hệ nhân quả Vector Clock (Lamport / Mattern):
 * - EQUAL: v1 == v2 (hai bản ghi cùng một trạng thái phát hành)
 * - DOMINATES: v1 thống trị v2 (v1 kế thừa và mới hơn v2 trong quan hệ nhân quả)
 * - DOMINATED: v2 thống trị v1 (v2 kế thừa và mới hơn v1 trong quan hệ nhân quả)
 * - CONCURRENT: Xung đột chỉnh sửa đồng thời! Hai người dùng hoặc thiết bị cập nhật độc lập mà chưa nhìn thấy phiên bản của nhau.
 */
export function compareVersionVectors(v1?: VersionVector, v2?: VersionVector): VectorComparison {
  const vec1 = v1 || {};
  const vec2 = v2 || {};
  const keys1 = Object.keys(vec1);
  const keys2 = Object.keys(vec2);

  if (keys1.length === 0 && keys2.length === 0) return 'EQUAL';
  if (keys1.length === 0 && keys2.length > 0) return 'DOMINATED';
  if (keys1.length > 0 && keys2.length === 0) return 'DOMINATES';

  const allKeys = new Set<string>([...keys1, ...keys2]);
  let hasGreater = false;
  let hasLesser = false;

  for (const k of allKeys) {
    const val1 = Number(vec1[k]) || 0;
    const val2 = Number(vec2[k]) || 0;
    if (val1 > val2) hasGreater = true;
    if (val1 < val2) hasLesser = true;
  }

  if (hasGreater && hasLesser) return 'CONCURRENT';
  if (hasGreater && !hasLesser) return 'DOMINATES';
  if (!hasGreater && hasLesser) return 'DOMINATED';
  return 'EQUAL';
}

/**
 * Hợp nhất hai version vector bằng cách lấy giá trị cực đại của từng nút tác tử (component-wise max)
 */
export function mergeVersionVectors(v1?: VersionVector, v2?: VersionVector): VersionVector {
  const res: VersionVector = {};
  const vec1 = v1 || {};
  const vec2 = v2 || {};
  const allKeys = new Set<string>([...Object.keys(vec1), ...Object.keys(vec2)]);
  for (const k of allKeys) {
    res[k] = Math.max(Number(vec1[k]) || 0, Number(vec2[k]) || 0);
  }
  return res;
}

/**
 * Tăng version vector của tác tử hiện tại (actorId) lên 1 đơn vị
 */
export function incrementVersionVector(v: VersionVector | undefined, actorId: string): VersionVector {
  const cleanId = String(actorId || 'node-local').trim() || 'node-local';
  const next: VersionVector = { ...(v || {}) };
  next[cleanId] = (Number(next[cleanId]) || 0) + 1;
  return next;
}

/**
 * Thuật toán hòa giải xung đột Version-Vector cho biên bản OSD (CRDT/Convergent Semantic Merge)
 * Tự động hòa nhập các chỉnh sửa đồng thời của nhiều người dùng/thiết bị mà không làm mất dữ liệu
 */
export function resolveConcurrentOsd(
  curr: OsdReceipt,
  inc: OsdReceipt,
  actorId?: string
): OsdReceipt {
  // 1. Hợp nhất Version Vector nhân quả
  let mergedVector = mergeVersionVectors(curr.versionVector, inc.versionVector);
  if (actorId) {
    mergedVector = incrementVersionVector(mergedVector, actorId);
  }

  // 2. Hợp nhất danh sách vật tư OSD (OsdItemDetail) theo mô hình tập hợp phi phá hủy (Union & Convergent Update)
  const mergedItemsMap = new Map<string, OsdItemDetail>();

  // Khóa nhận diện dòng vật tư: kết hợp materialCode + packageNo + osdType (hoặc id)
  const getItemKey = (it: OsdItemDetail) => {
    return `${normKey(it.materialCode)}|${normKey(it.packageNo || '')}|${it.osdType || 'damage'}|${it.id || ''}`;
  };

  const currItems = Array.isArray(curr.items) ? curr.items : [];
  const incItems = Array.isArray(inc.items) ? inc.items : [];

  for (const it of currItems) {
    mergedItemsMap.set(getItemKey(it), { ...it });
  }

  for (const it of incItems) {
    const key = getItemKey(it);
    const existingIt = mergedItemsMap.get(key);
    if (!existingIt) {
      // Dòng vật tư được một bên bổ sung thêm -> Giữ nguyên để không mất dòng mới
      mergedItemsMap.set(key, { ...it });
    } else {
      // Cả hai bên cùng chỉnh sửa trên cùng một dòng vật tư:
      // - Số lượng và khối lượng OSD: lấy giá trị cực đại để phản ánh đầy đủ sai lệch
      const resolvedQty = Math.max(Number(existingIt.osdQuantity) || 0, Number(it.osdQuantity) || 0);
      const resolvedWeight = Math.max(Number(existingIt.osdWeightKg) || 0, Number(it.osdWeightKg) || 0);

      // - Mô tả lỗi: kết hợp nếu cả hai có mô tả khác biệt
      const desc1 = existingIt.defectDescription?.trim() || '';
      const desc2 = it.defectDescription?.trim() || '';
      let combinedDesc = desc2 || desc1;
      if (desc1 && desc2 && desc1 !== desc2) {
        combinedDesc = desc1.includes(desc2)
          ? desc1
          : desc2.includes(desc1)
          ? desc2
          : `${desc1}; ${desc2}`;
      }

      // - Nguyên nhân & Biện pháp kiến nghị: hợp nhất thông tin
      const root1 = existingIt.rootCause?.trim() || '';
      const root2 = it.rootCause?.trim() || '';
      let combinedRoot = root2 || root1;
      if (root1 && root2 && root1 !== root2) {
        combinedRoot = `${root1}; ${root2}`;
      }

      const action1 = existingIt.proposedAction?.trim() || '';
      const action2 = it.proposedAction?.trim() || '';
      let combinedAction = action2 || action1;
      if (action1 && action2 && action1 !== action2) {
        combinedAction = `${action1}; ${action2}`;
      }

      mergedItemsMap.set(key, {
        ...existingIt,
        ...it,
        osdQuantity: resolvedQty,
        osdWeightKg: resolvedWeight,
        defectDescription: combinedDesc,
        rootCause: combinedRoot,
        proposedAction: combinedAction
      });
    }
  }

  const mergedItems = Array.from(mergedItemsMap.values());

  // Tự động tính toán lại tổng số lượng và khối lượng OSD từ danh sách sau khi hòa nhập
  let calculatedTotalQty = 0;
  let calculatedTotalWeight = 0;
  for (const it of mergedItems) {
    calculatedTotalQty += Number(it.osdQuantity) || 0;
    calculatedTotalWeight += Number(it.osdWeightKg) || 0;
  }
  calculatedTotalQty = Math.round(calculatedTotalQty * 1000) / 1000;
  calculatedTotalWeight = Math.round(calculatedTotalWeight * 100) / 100;

  // 3. Trạng thái biên bản (status):
  // Nếu bất kỳ người dùng nào đã đóng ('closed') biên bản, giữ trạng thái 'closed'
  const resolvedStatus: 'open' | 'closed' =
    curr.status === 'closed' || inc.status === 'closed' ? 'closed' : 'open';

  // Hợp nhất ghi chú giải quyết (resolutionNotes) nếu có
  const rNote1 = curr.resolutionNotes?.trim() || '';
  const rNote2 = inc.resolutionNotes?.trim() || '';
  let combinedResNotes = rNote2 || rNote1;
  if (rNote1 && rNote2 && rNote1 !== rNote2) {
    combinedResNotes = rNote1.includes(rNote2) ? rNote1 : `${rNote1}; ${rNote2}`;
  }

  // 4. File PDF đính kèm:
  // Ưu tiên bản có base64 dataUrl đầy đủ
  let finalPdf = curr.pdfAttachment;
  if (!curr.pdfAttachment && inc.pdfAttachment) {
    finalPdf = inc.pdfAttachment;
  } else if (curr.pdfAttachment && inc.pdfAttachment) {
    if (!curr.pdfAttachment.dataUrl && inc.pdfAttachment.dataUrl) {
      finalPdf = inc.pdfAttachment;
    } else if (curr.pdfAttachment.dataUrl && !inc.pdfAttachment.dataUrl) {
      finalPdf = curr.pdfAttachment;
    } else {
      const up1 = Date.parse(curr.pdfAttachment.uploadedAt || '') || 0;
      const up2 = Date.parse(inc.pdfAttachment.uploadedAt || '') || 0;
      finalPdf = up2 >= up1 ? inc.pdfAttachment : curr.pdfAttachment;
    }
  }

  // 5. Ghi chú chung (notes):
  const note1 = curr.notes?.trim() || '';
  const note2 = inc.notes?.trim() || '';
  let combinedNotes = note2 || note1;
  if (note1 && note2 && note1 !== note2) {
    combinedNotes = note1.includes(note2) ? note1 : `${note1} [Đồng thời: ${note2}]`;
  }

  // 6. Dấu vết tác giả và thời gian cập nhật
  const nowMs = Math.max(Number(curr.updatedAt) || 0, Number(inc.updatedAt) || 0, Date.now());
  const author1 = curr.lastEditedBy || curr.createdBy || '';
  const author2 = inc.lastEditedBy || inc.createdBy || '';
  const mergedAuthor =
    author1 && author2 && author1 !== author2
      ? `${author1}, ${author2}`
      : author2 || author1 || 'Hệ thống';

  return {
    ...curr,
    ...inc,
    items: mergedItems,
    totalOsdQuantity: calculatedTotalQty,
    totalOsdWeightKg: calculatedTotalWeight,
    status: resolvedStatus,
    resolutionNotes: combinedResNotes,
    resolvedAt:
      resolvedStatus === 'closed'
        ? inc.resolvedAt || curr.resolvedAt || new Date(nowMs).toISOString()
        : undefined,
    resolvedBy:
      resolvedStatus === 'closed'
        ? inc.resolvedBy || curr.resolvedBy || mergedAuthor
        : undefined,
    pdfAttachment: finalPdf,
    notes: combinedNotes,
    versionVector: mergedVector,
    updatedAt: nowMs,
    lastEditedBy: mergedAuthor,
    lastEditedAt: new Date(nowMs).toISOString()
  };
}
