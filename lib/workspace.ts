export function getWorkspaceAdvisorId(): string {
  const advisorId = process.env.OPEN_APP_ADVISOR_ID?.trim() || "public";
  if (advisorId.length > 128) {
    throw new Error("OPEN_APP_ADVISOR_ID must not exceed 128 characters");
  }
  return advisorId;
}
