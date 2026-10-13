import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { LoginForm } from "../forms";
import { Heading } from "../heading";

export default function Login(props: PageProps<"/login">) {
  return (
    <>
      <Heading title="Welcome back" sub="Log in to your treasury." />
      <Suspense>
        <Form searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  if (await currentUser()) redirect("/");
  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : "/"} />;
}

