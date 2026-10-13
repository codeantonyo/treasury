import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { VerifyForm } from "../forms";
import { Heading } from "../heading";

export default function Verify() {
  return (
    <>
      <Heading title="Check your email" sub="Enter the 6-digit code we sent you." />
      <Suspense>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  const user = await requireUser();
  if (user.emailVerified) redirect("/");
  return <VerifyForm email={user.email} />;
}
