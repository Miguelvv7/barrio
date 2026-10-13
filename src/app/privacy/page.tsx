import { contactLine, LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Privacy policy" };

export default function Privacy() {
  const { email, repo } = contactLine();
  return (
    <LegalPage title="Privacy policy" updated="13 October 2026">
      <p>
        Barrio connects customers with small local businesses so they can ask questions and book through voice assistants such
        as Alexa+. It is built and run by Miguel Victorio (Écija, Spain). This page explains what we collect and why.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>When you book</strong> (through Alexa+ or on this site): your name, phone number, optionally your email, and the
          booking details — business, date, time, service or party size and any note you add.
        </li>
        <li>
          <strong>Business owners</strong>: the business details they enter (name, address, phone, services, menu, hours) and,
          optionally, an email for booking notifications.
        </li>
        <li>
          We do <strong>not</strong> receive voice recordings or your Amazon account data. The voice assistant sends us only the
          details needed to answer or book (for example “Corte y Barba, Friday 17:15, Lucía, phone”).
        </li>
      </ul>
      <h2>Why</h2>
      <ul>
        <li>To make, show and manage your booking with the business you chose.</li>
        <li>To send you a confirmation email, only if you give us an email address.</li>
        <li>To prevent abuse (for example, limits on how many bookings one phone number can hold).</li>
      </ul>
      <h2>Who sees it</h2>
      <ul>
        <li>The business you booked with sees your booking in its agenda and calendar.</li>
        <li>
          Service providers that run Barrio for us: hosting (Vercel), database (Supabase), email delivery (Resend, only if you
          asked for an email). On the demo page <code>/try</code>, what you type or say is sent to Anthropic to generate the
          assistant’s replies.
        </li>
        <li>We don’t sell your data or use it for advertising.</li>
      </ul>
      <h2>How long we keep it</h2>
      <p>
        Bookings are deleted automatically 12 months after the appointment date. You can cancel a booking at any time with its
        reference and your phone number.
      </p>
      <h2>Cookies</h2>
      <p>Only essential cookies for business owners to stay signed in to their dashboard. No analytics or tracking cookies.</p>
      <h2>Your rights</h2>
      <p>
        Under the GDPR you can ask to access, correct or delete your data, or object to its use. Contact us
        {email ? (
          <>
            {" "}at <a href={`mailto:${email}`}>{email}</a>
          </>
        ) : (
          <>
            {" "}through <a href={repo}>the project page</a>
          </>
        )}
        . You can also complain to the Spanish data protection authority (AEPD).
      </p>
      <p>Barrio is not directed at children under 16.</p>
    </LegalPage>
  );
}
