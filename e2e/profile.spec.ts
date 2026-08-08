import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

// Profile header editing: the Edit control covers display name + a short bio,
// both persisted through the user_prefs repo path (server-side — a reload
// must still show them, not just the optimistic cache write).

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

/** Current bio from the signed-in user's user_prefs row (null when unset). */
async function storedBio(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const sb = window.__frog.supabase;
    const { data, error } = await sb
      .from("user_prefs")
      .select("bio")
      .is("deleted_at", null)
      .single();
    if (error) throw new Error(error.message);
    return (data?.bio as string | null) ?? null;
  });
}

test("profile edit saves name and bio, both survive a reload", async ({
  page,
}) => {
  await page.goto("/profile");
  await expect(page.getByTestId("profile-name")).toBeVisible();
  // Bio is hidden until set.
  await expect(page.getByTestId("profile-bio")).toHaveCount(0);

  await page.getByTestId("profile-name-edit").click();
  await page.getByTestId("profile-name-input").fill("Ollie the Frog");
  await page.getByTestId("profile-bio-input").fill("Chasing a 200 kg deadlift");
  await page.getByTestId("profile-name-save").click();

  await expect(page.getByTestId("profile-name")).toHaveText("Ollie the Frog");
  await expect(page.getByTestId("profile-bio")).toHaveText(
    "Chasing a 200 kg deadlift",
  );

  // Persisted server-side, not just the optimistic cache write.
  await expect.poll(() => storedBio(page)).toBe("Chasing a 200 kg deadlift");

  // Survives a reload — the repo read path.
  await page.reload();
  await expect(page.getByTestId("profile-name")).toHaveText("Ollie the Frog");
  await expect(page.getByTestId("profile-bio")).toHaveText(
    "Chasing a 200 kg deadlift",
  );

  // Clearing the bio removes it and persists the empty value.
  await page.getByTestId("profile-name-edit").click();
  await page.getByTestId("profile-bio-input").fill("");
  await page.getByTestId("profile-name-save").click();
  await expect(page.getByTestId("profile-bio")).toHaveCount(0);
  await expect.poll(() => storedBio(page)).toBeNull();
});
