import { contactLine, LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Terms of use" };

export default function Terms() {
  const { email, repo } = contactLine();
  return (
    <LegalPage title="Terms of use" updated="13 October 2026">
      <p>
        Barrio is a free service that lets small businesses answer questions and take bookings through voice assistants such as
        Alexa+. By using it you agree to these terms.
      </p>
      <h2>Bookings</h2>
      <ul>
        <li>A booking is an arrangement between you and the business. Prices, menus and opening hours are provided by the business.</li>
        <li>Allergen information is only what the business has declared. If it isn’t declared, ask the staff before ordering.</li>
        <li>Please cancel bookings you can’t make, using your reference and phone number.</li>
      </ul>
      <h2>Fair use</h2>
      <ul>
        <li>Don’t make bookings you don’t intend to keep, use someone else’s phone number, or try to disrupt the service.</li>
        <li>Business owners must only publish accurate information about their own business.</li>
      </ul>
      <h2>Availability</h2>
      <p>
        Barrio is provided as is. We work to keep it reliable, but we can’t guarantee it will always be available or error-free,
        and we aren’t liable for a business’s service.
      </p>
      <h2>Contact</h2>
      <p>
        {email ? <a href={`mailto:${email}`}>{email}</a> : <a href={repo}>Project page</a>}. These terms are governed by Spanish
        law.
      </p>
    </LegalPage>
  );
}
